#![allow(dead_code, unused_variables)]
//! Service parser + runner — Lane B implementation target.
//!
//! TODO Lane B: implement parsers for:
//!   - `docker-compose.yml` / `compose.yaml`
//!   - `Procfile`
//!   - `orchestra.yaml` (custom Orchestra service manifest)
//!   - `package.json` scripts section
//!
//! Each discovered service maps to a `crate::ipc::Service` and can be
//! started via `crate::pty::PtyManager`.
