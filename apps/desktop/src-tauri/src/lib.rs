pub mod fs;
pub mod git;
pub mod ipc;
pub mod memory;
pub mod pty;
pub mod services;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(fs::FsState::new())
        .manage(pty::PtyState::default())
        .invoke_handler(tauri::generate_handler![
            // File system (Lane A)
            fs::commands::fs_open_workspace,
            fs::commands::fs_list_files,
            fs::commands::fs_read_file,
            fs::commands::fs_write_file,
            fs::commands::fs_start_watching,
            fs::commands::fs_stop_watching,
            // PTY (Lane B)
            pty::commands::pty_spawn,
            pty::commands::pty_write,
            pty::commands::pty_resize,
            pty::commands::pty_kill,
            pty::commands::pty_claim,
            pty::commands::pty_list,
            // Services (Lane B)
            services::commands::services_detect,
            services::commands::services_run_all,
            services::commands::services_run_one,
            // Git worktrees (Lane E)
            git::commands::git_status,
            git::commands::git_worktree_add,
            git::commands::git_worktree_remove,
            git::commands::git_worktree_list,
            git::commands::git_worktree_diff,
            git::commands::git_worktree_merge,
            // Memory + lanes (Sprint 2/3 stubs)
            ipc::memory_query,
            ipc::memory_insert,
            ipc::list_lanes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Orchestra");
}
