# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Rules

- Always run unit and e2e tests after changing the code
- Always run linter and formatter after changing the code
- Do not try to get away of lint errors by disabling them
- Only commit when asked to

## Commands

```bash
# Dev
npm run dev           # Start Tauri dev server (Vite + Rust backend)

# Build
npm run build         # Production build (outputs .deb, .rpm, .AppImage)

# Unit tests
npm test              # Run all unit tests
npm test -- src/components/Sidebar.test.tsx  # Run a single test file

# E2e tests (requires a built binary first)
npm run build
npm run test:e2e

# Linting & formatting
npm run lint          # ESLint (TypeScript)
npm run format:check  # Prettier check
npm run format        # Prettier fix
npm run lint:rust     # Cargo clippy
npm run format:rust:check  # Cargo fmt check
npm run format:rust   # Cargo fmt fix
```

## Architecture

PI Notes is a Tauri v2 desktop app — a Rust backend with a React/TypeScript frontend communicating via Tauri's `invoke` IPC bridge.

### Frontend (`src/`)

- **`App.tsx`** — top-level state owner: current view, selected note, search query, theme. Passes callbacks down to children.
- **`api.ts`** — thin wrapper over `@tauri-apps/api/core` `invoke()`. All Tauri command calls go through here.
- **`types.ts`** — shared TypeScript types: `Note`, `AttachmentMeta`, `TagEntry`, `View`, `ColorTheme`.
- **`components/`** — `Sidebar` (nav + tags), `Feed` (note list), `NoteDetail` (read view), `NoteCard`, `AddNotePanel`, `EditNotePanel`, `BlockEditor`, `ContentEditor`, `TagInput`.
- **`tags.ts`** — tag validation and normalization logic (also mirrored in Rust `src-tauri/src/tags.rs`).

Views are a discriminated union: `"all" | "inbox" | "trash" | { tag: string }`. Switching views triggers `loadNotes()` in `App.tsx`.

WikiLinks (`[[Title]]`) are preprocessed via regex before being passed to `ReactMarkdown`.

### Backend (`src-tauri/src/`)

- **`lib.rs`** — all `#[tauri::command]` handlers + `run()`. Single `DbState(Mutex<Connection>)` managed state.
- **`db.rs`** — all SQLite queries. DB path resolved from: `PI_NOTES_DB_PATH` env var → `~/.local/share/pi-notes/db_path.conf` → `~/.local/share/pi-notes/notes.db`.
- **`models.rs`** — `Note` and `AttachmentMeta` structs with `Serialize`/`Deserialize`.
- **`tags.rs`** — tag normalization mirroring the frontend logic.

### E2E Tests (`e2e/`)

Uses WebdriverIO + `tauri-driver` + `WebKitWebDriver`. Tests run against the **release binary** — always build first.

Key pattern: WebKitWebDriver ignores WebdriverIO text selectors. Use `browser.execute()` + `browser.waitUntil()` for all DOM assertions. Use `browser.execute(async () => invoke(...))` to set up test data via Tauri API directly. See `e2e/helpers.ts` for `waitForText()`, `assertAbsent()`, and `clickNav()`.

E2e DB isolation: `PI_NOTES_DB_PATH` env var is set to a temp dir in `onPrepare` and cleaned up in `onComplete`.

## Linux System Dependencies

Required before `cargo check` / `npm run dev`:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev libssl-dev
```

For e2e tests also install:
```bash
sudo apt-get install -y webkit2gtk-driver xvfb
cargo install tauri-driver --locked
```

AppImage builds additionally require FUSE (`sudo modprobe fuse`) and `linuxdeploy` in PATH.
