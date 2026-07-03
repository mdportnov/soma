//! A tiny, dependency-free container so a backup/vault can hold the database
//! *and* its attachment files as one encrypted blob (previously only the DB was
//! captured, leaving imported PDFs/photos unbacked-up and — under the vault —
//! in cleartext on disk).
//!
//! Layout (little-endian):
//! `MAGIC(8) | entry_count(u32) | entry* ` where each entry is
//! `name_len(u16) | name(utf8) | data_len(u64) | data`.
//! The consumer names the DB entry `soma.db` and each attachment
//! `attachments/<basename>`.

const MAGIC: &[u8; 8] = b"SOMAAR1\0";
/// Guards against a corrupt/hostile length demanding a huge allocation.
const MAX_ENTRIES: u32 = 1_000_000;

pub struct Entry {
    pub name: String,
    pub data: Vec<u8>,
}

/// Serializes entries into the archive byte layout.
pub fn pack(entries: &[Entry]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&(entries.len() as u32).to_le_bytes());
    for e in entries {
        let name = e.name.as_bytes();
        out.extend_from_slice(&(name.len() as u16).to_le_bytes());
        out.extend_from_slice(name);
        out.extend_from_slice(&(e.data.len() as u64).to_le_bytes());
        out.extend_from_slice(&e.data);
    }
    out
}

/// True when `bytes` begins with the archive magic (v3 payloads), letting a
/// consumer tell an archive from a legacy raw-SQLite payload.
pub fn is_archive(bytes: &[u8]) -> bool {
    bytes.len() >= MAGIC.len() && &bytes[..MAGIC.len()] == MAGIC
}

/// Parses an archive, with bounds checks on every length so a truncated or
/// tampered blob returns an error rather than panicking.
pub fn unpack(bytes: &[u8]) -> Result<Vec<Entry>, String> {
    let err = || "Corrupt archive".to_string();
    if !is_archive(bytes) {
        return Err("Not a Soma archive".into());
    }
    let mut pos = MAGIC.len();
    let read = |b: &[u8], p: &mut usize, n: usize| -> Result<Vec<u8>, String> {
        if *p + n > b.len() {
            return Err("Corrupt archive".into());
        }
        let slice = b[*p..*p + n].to_vec();
        *p += n;
        Ok(slice)
    };

    let count_bytes = read(bytes, &mut pos, 4)?;
    let count = u32::from_le_bytes(count_bytes.try_into().map_err(|_| err())?);
    if count > MAX_ENTRIES {
        return Err("Archive entry count is implausible".into());
    }

    let mut entries = Vec::with_capacity(count as usize);
    for _ in 0..count {
        let name_len =
            u16::from_le_bytes(read(bytes, &mut pos, 2)?.try_into().map_err(|_| err())?) as usize;
        let name = String::from_utf8(read(bytes, &mut pos, name_len)?).map_err(|_| err())?;
        let data_len =
            u64::from_le_bytes(read(bytes, &mut pos, 8)?.try_into().map_err(|_| err())?) as usize;
        let data = read(bytes, &mut pos, data_len)?;
        entries.push(Entry { name, data });
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_multiple_entries_including_empty_data() {
        let entries = vec![
            Entry {
                name: "soma.db".into(),
                data: b"SQLite format 3\0 ...".to_vec(),
            },
            Entry {
                name: "attachments/a.pdf".into(),
                data: vec![0u8, 1, 2, 3, 255],
            },
            Entry {
                name: "attachments/empty.bin".into(),
                data: vec![],
            },
        ];
        let packed = pack(&entries);
        assert!(is_archive(&packed));
        let out = unpack(&packed).unwrap();
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].name, "soma.db");
        assert_eq!(out[1].data, vec![0u8, 1, 2, 3, 255]);
        assert_eq!(out[2].data, Vec::<u8>::new());
    }

    #[test]
    fn round_trips_zero_entries() {
        let packed = pack(&[]);
        assert_eq!(unpack(&packed).unwrap().len(), 0);
    }

    #[test]
    fn rejects_a_non_archive_blob() {
        assert!(!is_archive(b"SQLite format 3\0"));
        assert!(unpack(b"SQLite format 3\0 not an archive").is_err());
    }

    #[test]
    fn rejects_a_truncated_archive() {
        let packed = pack(&[Entry {
            name: "soma.db".into(),
            data: vec![1, 2, 3, 4, 5],
        }]);
        // Cut off inside the data section.
        assert!(unpack(&packed[..packed.len() - 2]).is_err());
    }

    #[test]
    fn rejects_a_bogus_length_without_panicking() {
        let mut packed = pack(&[Entry {
            name: "x".into(),
            data: vec![1, 2, 3],
        }]);
        // Corrupt the entry count to a huge value.
        packed[8..12].copy_from_slice(&u32::MAX.to_le_bytes());
        assert!(unpack(&packed).is_err());
    }
}
