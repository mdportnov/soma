//! Soma's at-rest encryption, as a library the GUI does not own.
//!
//! Everything here is free of Tauri, of any window, and of any UI: the vault
//! container format, the Argon2id parameters, the attachment archive, the
//! keychain lookup and the crash-safe write. The desktop app
//! (`soma_lib::vault`) is one consumer; the `soma-recover` CLI in this crate is
//! the other, and it is the reason the split exists — a user whose app will not
//! start must still be able to get their data out with nothing but a Rust
//! toolchain.
//!
//! Both consumers share one implementation of the format. A rescue tool with
//! its own parser is a rescue tool that can disagree with the writer.

#![deny(unsafe_code)]

pub mod archive;
pub mod format;
pub mod fsutil;
pub mod kdf;
pub mod keychain;
pub mod paths;

pub use format::{Header, KeySource, Payload, VaultError};
