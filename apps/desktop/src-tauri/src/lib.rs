pub mod fs;
pub mod git;
pub mod ipc;
pub mod memory;
pub mod pty;
pub mod services;

/// Application entry point called from main.rs.
pub fn run() {
    // Initialise structured logging. RUST_LOG env var controls verbosity.
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        // ── Plugins ──────────────────────────────────────────────────────
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        // ── IPC commands ─────────────────────────────────────────────────
        .invoke_handler(tauri::generate_handler![
            // Workspace
            ipc::open_workspace,
            // File system
            ipc::list_files,
            ipc::read_file,
            ipc::write_file,
            // Services
            ipc::parse_services,
            ipc::start_service,
            ipc::stop_service,
            // PTY
            ipc::pty_spawn,
            ipc::pty_write,
            ipc::pty_resize,
            ipc::pty_kill,
            ipc::pty_claim,
            ipc::pty_attach,
            // Git
            ipc::git_status,
            ipc::git_worktree_add,
            ipc::git_worktree_remove,
            // Memory
            ipc::memory_query,
            ipc::memory_insert,
            // Lanes
            ipc::list_lanes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Orchestra");
}
