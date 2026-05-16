//! System helpers — detect external binaries on the host PATH.
//!
//! macOS GUI apps don't inherit the user's shell PATH (Homebrew installs at
//! `/opt/homebrew/bin` and `/usr/local/bin` are invisible to a Finder-launched
//! process). To find a CLI like `claude` or `codex` we run the user's login
//! shell with `-lc "command -v <name>"` so PATH gets sourced from `.zshrc` /
//! `.bashrc` / `.profile`.

pub mod commands;
