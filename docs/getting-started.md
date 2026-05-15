# Getting Started — Running Orchestra from Source

This guide is for users and contributors who want to build and run Orchestra from source. If you just want to use the app, download a pre-built release from the [Releases page](https://github.com/placeholder/orchestra/releases).

---

## Prerequisites

You need the following tools installed before you begin.

### Required

| Tool         | Minimum version  | Install                                |
| ------------ | ---------------- | -------------------------------------- |
| Node.js      | 22 LTS           | https://nodejs.org or `fnm install 22` |
| pnpm         | 10               | `npm install -g pnpm@10`               |
| Rust + Cargo | stable (current) | https://rustup.rs                      |
| Git          | 2.38+            | https://git-scm.com                    |

### Platform-specific (Linux only)

Orchestra's Tauri shell requires several system libraries on Linux. Install them with:

```sh
# Debian / Ubuntu
sudo apt-get update && sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  libsoup-3.0-dev \
  libjavascriptcoregtk-4.1-dev

# Fedora / RHEL
sudo dnf install -y \
  webkit2gtk4.1-devel \
  openssl-devel \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

### Platform-specific (Windows only)

- Visual Studio C++ Build Tools (MSVC toolchain): install via the [Visual Studio installer](https://visualstudio.microsoft.com/downloads/).
- WebView2 runtime: pre-installed on Windows 11. For Windows 10: https://developer.microsoft.com/en-us/microsoft-edge/webview2/

---

## Clone and install

```sh
git clone https://github.com/placeholder/orchestra.git
cd orchestra
pnpm install
```

The `pnpm install` step installs all JavaScript/TypeScript dependencies across all workspaces. The Rust dependencies are fetched lazily by Cargo when you first run or build.

---

## Development mode

Run the Tauri dev server (hot-reloads both the React UI and recompiles Rust on file save):

```sh
pnpm tauri dev
```

The first run takes a few minutes because Cargo needs to compile all Rust crates. Subsequent runs are much faster thanks to incremental compilation.

The app window opens automatically once the build completes.

---

## Running the full test suite

```sh
# TypeScript / JavaScript tests (Vitest)
pnpm test

# Lint + type-check
pnpm lint
pnpm typecheck

# Rust checks
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
```

---

## Building a release binary

```sh
pnpm tauri build
```

Artifacts are placed in `apps/desktop/src-tauri/target/release/bundle/`. On macOS you get a `.dmg`, on Linux a `.deb` and `.AppImage`, on Windows an `.msi`.

Cross-compilation (e.g. building a Linux binary from macOS) is not straightforward with Tauri. The CI pipeline in `.github/workflows/release.yml` handles multi-platform builds using GitHub Actions runners.

---

## Project structure overview

```
orchestra/
├── apps/desktop/          Tauri 2 app (React UI + Rust backend)
├── packages/
│   ├── ai-runtime/        Vercel AI SDK + LangGraph coordinator
│   ├── mcp-client/        MCP server lifecycle manager
│   ├── memory/            SQLite + sqlite-vec memory store
│   └── skills/            SKILL.md parser + system-prompt injector
├── docs/                  Architecture docs, ADRs, this file
└── .github/               CI/CD workflows, issue templates
```

For a deeper look at how the pieces connect, read `docs/architecture.md`.

---

## Configuring AI providers

When you first launch Orchestra from source, open **Settings → AI Providers** and enter your API key(s). Supported providers out of the box:

- **Anthropic** (Claude) — https://console.anthropic.com
- **OpenAI** (GPT-4o, o1) — https://platform.openai.com
- **Google** (Gemini) — https://ai.google.dev
- **Ollama** (local, no key needed) — https://ollama.com
- **OpenRouter** — https://openrouter.ai

Keys are stored in Tauri's secure local store and never sent anywhere other than the respective provider endpoint.

---

## Common issues

### `cargo: command not found`

Rust is not on your PATH. Run `source "$HOME/.cargo/env"` (or restart your shell) after installing via rustup.

### `libwebkit2gtk-4.1-dev: unable to locate package` (Ubuntu)

Make sure your apt sources include `universe`:

```sh
sudo add-apt-repository universe
sudo apt-get update
```

### App window does not open on macOS

Check that you have Xcode Command Line Tools installed: `xcode-select --install`.

### `pnpm install` fails with peer dependency errors

Ensure you are using pnpm 10 (`pnpm --version`). Earlier versions have different peer resolution behaviour.

---

## Contributing

See `CONTRIBUTING.md` for the full contribution workflow, conventional commit format, branch naming, and PR process.
