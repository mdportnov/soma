//! `soma-recover` — get your data out of a Soma vault without the app.
//!
//! Soma encrypts its database and attachments when it closes. If the app then
//! fails to open them — a lost keychain key, a forgotten passphrase typed
//! wrong, a machine you no longer boot — the encrypted files on disk are still
//! perfectly good data, and there has to be a way to reach it that does not go
//! through the application that is failing. This is that way.
//!
//! It reads through `soma_vault::format`, the same code the app writes with, so
//! there is no second interpretation of the format to drift out of sync.
//!
//! Safety rules, in order of importance:
//!  1. It never writes into Soma's own directory. Recovery outputs go to a
//!     directory you name, and naming Soma's directory is refused.
//!  2. It never deletes or modifies the vault files it reads.
//!  3. It never overwrites an existing file in the output directory unless you
//!     pass `--overwrite`.
//!  4. Without `--out` it only inspects, and decrypts nothing to disk.

use std::io::{BufRead, IsTerminal, Read, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use soma_vault::format::{self, Payload, VaultError, MODE_PASSPHRASE};
use soma_vault::{archive, keychain, paths};

const USAGE: &str = "\
soma-recover — decrypt a Soma vault outside the app

USAGE
  soma-recover inspect [FILE...] [--app-dir DIR]
  soma-recover extract [FILE...] --out DIR [KEY OPTION] [--overwrite]

  With no FILE, both `soma.db.vault` and `attachments.vault` are taken from
  Soma's data directory. `inspect` decrypts nothing to disk; `extract` writes
  the recovered database and attachment files into --out.

KEY OPTIONS
  --keychain              read the data key from the OS keychain (the default
                          for a keychain-mode vault)
  --key HEX               use this 32-byte key, as 64 hex characters
  --key-stdin             read that hex key from standard input
  --passphrase-stdin      read the passphrase from standard input
                          (the default for a passphrase-mode vault; if standard
                          input is a terminal you are prompted instead)

OTHER OPTIONS
  --out DIR               where to write recovered files (required by extract)
  --app-dir DIR           Soma's data directory, if not the default for this OS
  --overwrite             allow replacing files that already exist in --out
  -h, --help              show this text

EXAMPLES
  soma-recover inspect
  soma-recover extract --out ~/soma-recovered
  soma-recover extract ./attachments.vault --out /tmp/rescue
  printf '%s' \"$KEY_HEX\" | soma-recover extract --out /tmp/rescue --key-stdin

NOTES
  The keychain key can also be read by hand:
    security find-generic-password -s com.soma.health -a db-encryption-key -w
  Nothing this tool does removes or alters the vault files it reads.
";

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(Failure::Usage(msg)) => {
            eprintln!("soma-recover: {msg}\n\n{USAGE}");
            ExitCode::from(2)
        }
        Err(Failure::Error(msg)) => {
            eprintln!("soma-recover: {msg}");
            ExitCode::FAILURE
        }
    }
}

#[derive(Debug)]
enum Failure {
    Usage(String),
    Error(String),
}

impl From<String> for Failure {
    fn from(s: String) -> Self {
        Failure::Error(s)
    }
}

impl From<VaultError> for Failure {
    fn from(e: VaultError) -> Self {
        Failure::Error(e.to_string())
    }
}

type Result<T> = std::result::Result<T, Failure>;

// ── arguments ────────────────────────────────────────────────────────────────

#[derive(Debug, PartialEq, Clone, Copy)]
enum Command {
    Inspect,
    Extract,
}

/// Where the AES key comes from. `Auto` follows the vault header: keychain for
/// a keychain-mode file, passphrase for a passphrase-mode one.
enum KeyOption {
    Auto,
    Keychain,
    Hex(String),
    HexStdin,
    PassphraseStdin,
}

struct Args {
    command: Command,
    files: Vec<PathBuf>,
    out: Option<PathBuf>,
    app_dir: Option<PathBuf>,
    key: KeyOption,
    overwrite: bool,
}

fn parse_args(argv: Vec<String>) -> Result<Option<Args>> {
    let mut it = argv.into_iter().peekable();
    let command = match it.peek().map(String::as_str) {
        None => return Err(Failure::Usage("no command given".into())),
        Some("-h") | Some("--help") | Some("help") => return Ok(None),
        Some("inspect") => {
            it.next();
            Command::Inspect
        }
        Some("extract") => {
            it.next();
            Command::Extract
        }
        Some(other) => {
            return Err(Failure::Usage(format!(
                "unknown command {other:?} (expected `inspect` or `extract`)"
            )))
        }
    };

    let mut args = Args {
        command,
        files: Vec::new(),
        out: None,
        app_dir: None,
        key: KeyOption::Auto,
        overwrite: false,
    };

    while let Some(arg) = it.next() {
        let mut value = |name: &str| -> Result<String> {
            it.next()
                .ok_or_else(|| Failure::Usage(format!("{name} needs a value")))
        };
        match arg.as_str() {
            "-h" | "--help" => return Ok(None),
            "--out" => args.out = Some(PathBuf::from(value("--out")?)),
            "--app-dir" => args.app_dir = Some(PathBuf::from(value("--app-dir")?)),
            "--key" => args.key = KeyOption::Hex(value("--key")?),
            "--key-stdin" => args.key = KeyOption::HexStdin,
            "--keychain" => args.key = KeyOption::Keychain,
            "--passphrase-stdin" => args.key = KeyOption::PassphraseStdin,
            "--overwrite" => args.overwrite = true,
            other if other.starts_with('-') => {
                return Err(Failure::Usage(format!("unknown option {other:?}")))
            }
            path => args.files.push(PathBuf::from(path)),
        }
    }

    if args.command == Command::Extract && args.out.is_none() {
        return Err(Failure::Usage(
            "`extract` needs --out DIR — refusing to guess where to put your data".into(),
        ));
    }
    Ok(Some(args))
}

// ── main flow ────────────────────────────────────────────────────────────────

fn run() -> Result<()> {
    let Some(args) = parse_args(std::env::args().skip(1).collect())? else {
        print!("{USAGE}");
        return Ok(());
    };

    let app_dir = match &args.app_dir {
        Some(d) => d.clone(),
        None => paths::app_config_dir()?,
    };

    let files = if args.files.is_empty() {
        let candidates = [
            app_dir.join(paths::VAULT_FILE),
            app_dir.join(paths::ATTACHMENTS_VAULT),
        ];
        let present: Vec<PathBuf> = candidates.iter().filter(|p| p.is_file()).cloned().collect();
        if present.is_empty() {
            return Err(Failure::Error(format!(
                "no vault files in {} — name a file explicitly, or pass --app-dir",
                app_dir.display()
            )));
        }
        present
    } else {
        args.files.clone()
    };

    let out = match &args.out {
        Some(dir) => Some(prepare_out_dir(dir, &app_dir)?),
        None => None,
    };

    let mut failures = 0usize;
    for (i, file) in files.iter().enumerate() {
        if i > 0 {
            println!();
        }
        if let Err(e) = handle_one(file, out.as_deref(), &args) {
            let msg = match e {
                Failure::Usage(m) | Failure::Error(m) => m,
            };
            eprintln!("  ! {msg}");
            failures += 1;
        }
    }

    if failures > 0 {
        return Err(Failure::Error(format!(
            "{failures} of {} file(s) could not be recovered — nothing was changed on disk for those",
            files.len()
        )));
    }
    if out.is_none() {
        println!("\nNothing was written. Re-run with `extract --out DIR` to recover the contents.");
    }
    Ok(())
}

/// Validates and creates the output directory. Refuses Soma's own directory:
/// the whole point of a recovery tool is that it cannot make the situation
/// worse, and writing a half-recovered database over the live one would.
fn prepare_out_dir(dir: &Path, app_dir: &Path) -> Result<PathBuf> {
    std::fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    let out = dir
        .canonicalize()
        .map_err(|e| format!("resolve {}: {e}", dir.display()))?;
    if let Ok(app) = app_dir.canonicalize() {
        if out == app || out.starts_with(&app) {
            return Err(Failure::Error(format!(
                "refusing to write into Soma's own data directory ({}).\n  \
                 Recover somewhere else, check the files, and copy them in yourself.",
                app.display()
            )));
        }
    }
    Ok(out)
}

fn handle_one(file: &Path, out: Option<&Path>, args: &Args) -> Result<()> {
    println!("{}", file.display());
    let raw = std::fs::read(file).map_err(|e| format!("read {}: {e}", file.display()))?;
    let header = format::parse_header(&raw)?;
    println!(
        "  format v{}, {} mode, {} bytes",
        header.format_version,
        header.mode_name(),
        raw.len()
    );
    if header.mode == MODE_PASSPHRASE {
        println!(
            "  argon2id m={} KiB, t={}, p={}",
            header.params.m_cost, header.params.t_cost, header.params.p_cost
        );
    }

    if args.command == Command::Inspect && out.is_none() {
        return Ok(());
    }

    let key = resolve_key(&header, &args.key)?;
    let plain = format::open(&raw, &header, &key)?;
    println!("  unlocked: {} bytes of plaintext", plain.len());

    match Payload::detect(plain)? {
        Payload::Database(bytes) => write_database(&bytes, out, args.overwrite)?,
        Payload::Attachments(entries) => write_attachments(&entries, out, args.overwrite)?,
        Payload::Unknown(bytes) => {
            return Err(Failure::Error(format!(
                "the vault opened but holds neither a database nor an attachment archive \
                 ({} bytes, starting {:02x?}) — this build of soma-recover is older than the vault",
                bytes.len(),
                &bytes[..bytes.len().min(8)]
            )))
        }
    }
    Ok(())
}

fn write_database(bytes: &[u8], out: Option<&Path>, overwrite: bool) -> Result<()> {
    println!("  contents: SQLite database, {} bytes", bytes.len());
    let Some(out) = out else { return Ok(()) };
    let target = out.join(paths::DB_FILE);
    write_new_file(&target, bytes, overwrite)?;
    println!("  -> {}", target.display());
    Ok(())
}

fn write_attachments(
    entries: &[archive::Entry],
    out: Option<&Path>,
    overwrite: bool,
) -> Result<()> {
    let total: usize = entries.iter().map(|e| e.data.len()).sum();
    println!(
        "  contents: attachment archive, {} file(s), {total} bytes",
        entries.len()
    );
    for e in entries {
        println!("    {:>10}  {}  {}", e.data.len(), sniff(&e.data), e.name);
    }
    let Some(out) = out else { return Ok(()) };

    let dir = out.join(paths::ATTACHMENTS_DIR);
    std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    for e in entries {
        let name = safe_name(&e.name)?;
        let target = dir.join(name);
        write_new_file(&target, &e.data, overwrite)?;
    }
    println!("  -> {}", dir.display());
    Ok(())
}

/// Strips the archive's `attachments/` prefix and refuses anything that could
/// escape the output directory. The archive is decrypted and authenticated, so
/// this is belt-and-braces — but a rescue tool is exactly where you want both.
fn safe_name(entry_name: &str) -> Result<String> {
    let name = entry_name
        .strip_prefix(&format!("{}/", paths::ATTACHMENTS_DIR))
        .unwrap_or(entry_name);
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || Path::new(name).is_absolute()
    {
        return Err(Failure::Error(format!(
            "archive entry {entry_name:?} has an unsafe name — skipping it rather than \
             writing outside the output directory"
        )));
    }
    Ok(name.to_string())
}

fn write_new_file(target: &Path, bytes: &[u8], overwrite: bool) -> Result<()> {
    if target.exists() && !overwrite {
        return Err(Failure::Error(format!(
            "{} already exists — pass --overwrite to replace it",
            target.display()
        )));
    }
    soma_vault::fsutil::atomic_write(target, bytes)?;
    Ok(())
}

/// A quick look at the leading bytes, so the operator can see at a glance that
/// what came out is a real PDF or image and not noise.
fn sniff(data: &[u8]) -> &'static str {
    const SIGNATURES: &[(&[u8], &str)] = &[
        (b"%PDF", "PDF"),
        (b"\x89PNG\r\n\x1a\n", "PNG"),
        (b"\xFF\xD8\xFF", "JPEG"),
        (b"GIF87a", "GIF"),
        (b"GIF89a", "GIF"),
        (b"II*\x00", "TIFF"),
        (b"MM\x00*", "TIFF"),
        (b"SQLite format 3\x00", "SQLite"),
        (b"PK\x03\x04", "ZIP"),
        (b"DICM", "DICOM"),
    ];
    for (sig, name) in SIGNATURES {
        if data.starts_with(sig) {
            return name;
        }
    }
    // WebP and HEIC carry their marker a few bytes in.
    if data.len() > 12 && &data[..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        return "WebP";
    }
    if data.len() > 12 && &data[4..8] == b"ftyp" {
        return "HEIF/MP4";
    }
    "unknown"
}

// ── key resolution ───────────────────────────────────────────────────────────

fn resolve_key(header: &format::Header, option: &KeyOption) -> Result<[u8; 32]> {
    match option {
        KeyOption::Hex(hex) => Ok(keychain::parse_key(hex)?),
        KeyOption::HexStdin => Ok(keychain::parse_key(&read_stdin_line("Key (hex): ")?)?),
        KeyOption::Keychain => Ok(keychain_key()?),
        KeyOption::PassphraseStdin => Ok(format::derive_key_for_header(
            &read_stdin_line("Passphrase: ")?,
            header,
        )?),
        KeyOption::Auto => {
            if header.mode == MODE_PASSPHRASE {
                let passphrase = read_stdin_line("Passphrase: ")?;
                println!("  deriving the key (argon2id, a few seconds)…");
                Ok(format::derive_key_for_header(&passphrase, header)?)
            } else {
                Ok(keychain_key()?)
            }
        }
    }
}

fn keychain_key() -> Result<[u8; 32]> {
    keychain::read_key().map_err(|e| {
        Failure::Error(format!(
            "{e}\n  \
             On macOS this usually means the key is still there but this program is not the one \
             that stored it. Read it by hand and pass it in:\n    \
             security find-generic-password -s {} -a {} -w",
            keychain::SERVICE,
            keychain::KEY_USER
        ))
    })
}

/// Reads one line from standard input, prompting first when that is a terminal.
/// The passphrase is echoed — hiding it would mean raw terminal handling, and a
/// rescue tool is not the place for `unsafe` or an extra dependency. Pipe it in
/// if that matters.
fn read_stdin_line(prompt: &str) -> Result<String> {
    let stdin = std::io::stdin();
    if stdin.is_terminal() {
        print!("  {prompt}");
        let _ = std::io::stdout().flush();
        let mut line = String::new();
        stdin
            .lock()
            .read_line(&mut line)
            .map_err(|e| format!("read from the terminal: {e}"))?;
        return Ok(line.trim_end_matches(['\r', '\n']).to_string());
    }
    let mut buf = String::new();
    stdin
        .lock()
        .read_to_string(&mut buf)
        .map_err(|e| format!("read standard input: {e}"))?;
    Ok(buf.trim_end_matches(['\r', '\n']).to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(argv: &[&str]) -> Result<Option<Args>> {
        parse_args(argv.iter().map(|s| s.to_string()).collect())
    }

    #[test]
    fn extract_without_an_output_directory_is_refused() {
        let err = args(&["extract"]).err().expect("should be rejected");
        match err {
            Failure::Usage(m) => assert!(m.contains("--out")),
            Failure::Error(m) => panic!("expected a usage error, got {m}"),
        }
    }

    #[test]
    fn inspect_without_an_output_directory_is_fine() {
        let parsed = args(&["inspect"]).unwrap().unwrap();
        assert_eq!(parsed.command, Command::Inspect);
        assert!(parsed.out.is_none());
        assert!(parsed.files.is_empty());
    }

    #[test]
    fn files_and_options_can_be_mixed() {
        let parsed = args(&[
            "extract",
            "a.vault",
            "--out",
            "/tmp/x",
            "b.vault",
            "--overwrite",
        ])
        .unwrap()
        .unwrap();
        assert_eq!(parsed.files.len(), 2);
        assert_eq!(parsed.out.unwrap(), PathBuf::from("/tmp/x"));
        assert!(parsed.overwrite);
    }

    #[test]
    fn an_unknown_command_or_option_is_a_usage_error() {
        assert!(matches!(args(&["decrypt"]), Err(Failure::Usage(_))));
        assert!(matches!(
            args(&["inspect", "--wat"]),
            Err(Failure::Usage(_))
        ));
        assert!(matches!(
            args(&["extract", "--out"]),
            Err(Failure::Usage(_))
        ));
    }

    #[test]
    fn help_asks_for_no_work() {
        assert!(args(&["--help"]).unwrap().is_none());
        assert!(args(&["inspect", "-h"]).unwrap().is_none());
    }

    /// The one rule that matters most: recovery output can never land in the
    /// directory the app reads from.
    #[test]
    fn refuses_to_extract_into_somas_own_directory() {
        let base = std::env::temp_dir().join(format!("soma-recover-guard-{}", std::process::id()));
        let app = base.join(paths::IDENTIFIER);
        std::fs::create_dir_all(app.join("attachments")).unwrap();

        assert!(prepare_out_dir(&app, &app).is_err());
        assert!(prepare_out_dir(&app.join("attachments"), &app).is_err());
        assert!(prepare_out_dir(&base.join("elsewhere"), &app).is_ok());

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn an_existing_file_is_not_clobbered_without_overwrite() {
        let dir = std::env::temp_dir().join(format!("soma-recover-write-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("soma.db");
        std::fs::write(&target, b"precious").unwrap();

        assert!(write_new_file(&target, b"new", false).is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"precious");
        write_new_file(&target, b"new", true).unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"new");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn archive_names_that_could_escape_the_output_directory_are_refused() {
        assert_eq!(safe_name("attachments/report.pdf").unwrap(), "report.pdf");
        assert_eq!(safe_name("report.pdf").unwrap(), "report.pdf");
        assert!(safe_name("attachments/../../etc/passwd").is_err());
        assert!(safe_name("attachments/sub/dir.pdf").is_err());
        assert!(safe_name("/etc/passwd").is_err());
        assert!(safe_name("attachments/").is_err());
    }

    #[test]
    fn signatures_are_recognised() {
        assert_eq!(sniff(b"%PDF-1.7\n..."), "PDF");
        assert_eq!(sniff(b"\x89PNG\r\n\x1a\n...."), "PNG");
        assert_eq!(sniff(b"\xFF\xD8\xFF\xE0 jfif"), "JPEG");
        assert_eq!(sniff(b"SQLite format 3\x00rest"), "SQLite");
        assert_eq!(sniff(b"RIFF\x00\x00\x00\x00WEBPVP8 "), "WebP");
        assert_eq!(sniff(b"random bytes here"), "unknown");
        assert_eq!(sniff(b""), "unknown");
    }
}
