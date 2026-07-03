//! Crash-safe file writes.

use std::fs;
use std::io::Write;
use std::path::Path;

/// Writes `bytes` to `path` atomically and durably: the data goes to a sibling
/// `.tmp` file which is fsynced and then renamed over the target, so a crash
/// or power loss leaves either the old file or the complete new one — never a
/// truncated mix. The parent directory is fsynced best-effort on unix so the
/// rename itself survives a crash.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut tmp_name = path
        .file_name()
        .ok_or_else(|| format!("invalid path: {}", path.display()))?
        .to_os_string();
    tmp_name.push(".tmp");
    let tmp = path.with_file_name(tmp_name);

    let write_tmp = |tmp: &Path| -> std::io::Result<()> {
        let mut f = fs::File::create(tmp)?;
        f.write_all(bytes)?;
        f.sync_all()
    };
    if let Err(e) = write_tmp(&tmp) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("write {}: {e}", tmp.display()));
    }
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("replace {}: {e}", path.display()));
    }
    #[cfg(unix)]
    if let Some(dir) = path.parent() {
        if let Ok(d) = fs::File::open(dir) {
            let _ = d.sync_all();
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("soma-fsutil-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn writes_a_new_file_and_leaves_no_tmp_behind() {
        let dir = temp_dir("new");
        let target = dir.join("out.bin");
        atomic_write(&target, b"hello").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"hello");
        assert!(!dir.join("out.bin.tmp").exists());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn replaces_an_existing_file() {
        let dir = temp_dir("replace");
        let target = dir.join("out.bin");
        fs::write(&target, b"old contents").unwrap();
        atomic_write(&target, b"new").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"new");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn errors_on_a_missing_parent_directory() {
        let dir = temp_dir("missing").join("nope");
        assert!(atomic_write(&dir.join("out.bin"), b"x").is_err());
    }
}
