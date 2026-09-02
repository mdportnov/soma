# Getting your data out when Soma won't open it

Soma's at-rest encryption replaces `soma.db` with `soma.db.vault` (and the
`attachments/` folder with `attachments.vault`) whenever the app closes
cleanly. If the app then cannot open them, those files are still your complete
health record — nothing has been lost. This page is how you read them without
the app.

**Soma will never start a new database while a vault is on disk.** If it cannot
unlock, it stops on a recovery screen and says why. If you are looking at
onboarding, you genuinely have no vault; check the data folder before assuming
otherwise.

## Where your files are

| OS      | Folder                                                |
| ------- | ----------------------------------------------------- |
| macOS   | `~/Library/Application Support/com.soma.health`       |
| Linux   | `$XDG_CONFIG_HOME/com.soma.health` (or `~/.config/…`) |
| Windows | `%APPDATA%\com.soma.health`                           |

Inside it: `soma.db` (plaintext, only while the app runs), `soma.db.vault`,
`attachments/`, `attachments.vault`.

## The most common cause on macOS: an update

Soma is signed **ad-hoc** — it has no paid Apple Developer certificate, on
purpose (see `docs/releasing.md`). A keychain entry's access control is bound to
the signature of the app that created it, and every build produces a different
signature. So after you replace `Soma.app` with a new version, macOS sees a
_different application_ asking for the key and refuses.

Your key and your data are untouched. Read the key yourself:

```sh
security find-generic-password -s com.soma.health -a db-encryption-key -w
```

Approve the prompt, and paste the 64-character result into the "Recovery key"
box on Soma's recovery screen. Then save it somewhere — this will happen again
on the next update until Soma is signed with a real certificate.

Settings → Database encryption shows the same key at any time under **Show
recovery key**, and offers it automatically when you first turn keychain mode
on.

## soma-recover

The offline tool. It reads the vault format through the same code the app writes
with (`src-tauri/crates/soma-vault`), so there is no second implementation to
disagree with the first. It builds with nothing but a Rust toolchain — no
Tauri, no webkit, no frontend — because a rescue tool that needs a working GUI
build is not a rescue tool.

```sh
cd src-tauri
cargo build --release -p soma-vault --bin soma-recover
./target/release/soma-recover --help
```

### Look before you touch

`inspect` decrypts nothing to disk. With no file arguments it finds both vaults
in Soma's data folder:

```sh
soma-recover inspect
```

```
/Users/you/Library/Application Support/com.soma.health/soma.db.vault
  format v2, keychain mode, 946242 bytes
```

### Recover

`extract` requires `--out`, and refuses to write into Soma's own folder:

```sh
soma-recover extract --out ~/soma-recovered
```

It writes `soma.db` and `attachments/` under that directory, listing every
attachment with its size and detected type so you can see at a glance that real
PDFs and images came out:

```
  contents: attachment archive, 12 file(s), 12409831 bytes
       282610  PDF   attachments/1784573712139-21.04.24 Bali Check-up.pdf
       508911  JPEG  attachments/1788182304942-screenshot.jpeg
```

Check the results, then copy them into the data folder yourself.

### Keys and passphrases

By default the tool follows the vault header: the OS keychain for a
keychain-mode vault, a passphrase prompt for a passphrase-mode one.

```sh
# hand it the key instead of letting it ask the keychain
security find-generic-password -s com.soma.health -a db-encryption-key -w \
  | soma-recover extract --out ~/soma-recovered --key-stdin

# passphrase mode, non-interactive
printf '%s' "$PASSPHRASE" | soma-recover extract --out ~/rescue --passphrase-stdin
```

A passphrase typed at the prompt is echoed — hiding it would mean raw terminal
handling, which is not what belongs in a rescue tool. Pipe it in if that
matters.

### What it will not do

- Write into Soma's data folder. Ever. Recover elsewhere, check, copy in.
- Delete or modify the vault files it reads.
- Overwrite an existing file in `--out` without `--overwrite`.
- Guess an output directory: `extract` fails without `--out`.

### Errors it distinguishes

| Message                                     | Meaning                                                 |
| ------------------------------------------- | ------------------------------------------------------- |
| `This file is not a Soma vault`             | Wrong file — check the name                             |
| `created by a newer version of Soma`        | Your Soma is older than the file; update it             |
| `The vault header is damaged`               | Truncated or corrupted file                             |
| `Wrong passphrase, or the vault is damaged` | Passphrase-mode vault, authentication failed            |
| `This key does not open this vault`         | Keychain-mode vault, the key belongs to a different one |

## Formats it reads

Both on-disk versions. Format **v1** predates storing the Argon2 parameters in
the header and is read with the pinned legacy values in `soma_vault::kdf`; those
constants must never change. Format **v2** carries `m/t/p` in the header, so a
future change to the crate's defaults cannot orphan a file.

## If you are handing this to someone else

The two sentences that matter, in order:

1. Your data is still on your disk, complete, and Soma has not deleted or
   changed anything.
2. The problem is a key the operating system will not release, not a lost
   database.
