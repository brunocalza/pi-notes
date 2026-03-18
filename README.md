# PI Notes

A minimal desktop note-taking app built with Tauri v2 + React.

## Features

- Inbox / All Notes / Trash views
- Tag-based organization with hierarchical tags (`language/rust`)
- Markdown rendering with WikiLinks (`[[Title]]`), math (KaTeX), and GFM
- File attachments
- Dark/light mode and color themes

## Development

**Prerequisites (Linux)**

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
  libayatana-appindicator3-dev librsvg2-dev libssl-dev
```

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Outputs `.deb`, `.rpm`, and `.AppImage` to `src-tauri/target/release/bundle/`.

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4
- **Backend**: Rust, SQLite (via rusqlite)
- **Framework**: Tauri v2
