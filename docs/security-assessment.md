# Security Assessment

> Status: identified, not yet fixed.

---

## 🔴 Critical

### 1. `open_attachment` — path traversal via filename

`commands.rs` writes to `temp_dir().join(&filename)` where `filename` comes from the stored
attachment record. If a filename was saved as `../../etc/cron.d/job`, the write escapes the
temp dir.

**Fix:** strip directory components with `Path::new(&filename).file_name()` before joining.

---

### 2. `open_url` — no URL scheme validation

`xdg-open` is called with an unvalidated URL. `Command::arg()` prevents shell injection, but
`xdg-open` will open `file:///etc/passwd` or trigger arbitrary protocol handlers.

**Fix:** whitelist schemes (`http`, `https`, `mailto`) before spawning.

---

### 3. `set_note_image` — arbitrary filesystem path stored

The image path is stored as-is with no validation. A crafted IPC call could store any path,
which then gets served back to the frontend.

**Fix:** validate the path stays within the app's data directory, or restrict to paths
obtained via a Tauri file dialog (already validated by the OS).

---

## 🟠 High

### 4. CSP is `null`

`tauri.conf.json` has `"csp": null`. Any XSS in the webview has full access to Tauri's IPC
bridge. A note containing `<img src=x onerror="invoke('delete_note', ...)">` would execute.

**Fix:** enable a strict CSP in `tauri.conf.json` and add `rehype-sanitize` to the markdown
rendering pipeline.

---

### 5. No input bounds on IPC commands

`limit` in cursor pagination is unbounded (`i64`), `content` has no max size, `tags` no max
count. A caller with IPC access could exhaust memory.

**Fix:** cap `limit` at e.g. 1000; add reasonable size checks in the service layer.

---

## 🟡 Medium

### 6. Attachment filename not sanitized on insert

Filenames are stored in the DB as-is. Combined with issue #1, a `../`-prefixed filename
causes a path traversal on open. Issue #1's fix covers the write, but filenames should also
be rejected at insert time.

**Fix:** reject filenames containing `/`, `\`, or `..` in `add_attachment`.

---

### 7. `set_db_path_setting` — arbitrary path accepted

The DB path can be set to any filesystem location. SQLite will refuse non-DB files, but a
crafted path could overwrite an existing file on startup or point to a world-writable location.

**Fix:** validate the path is within `dirs::data_local_dir()` or a directory chosen via file
dialog.

---

### 8. Backlinks LIKE pattern uses raw note title

```rust
let pattern = format!("%[[{title}]]%");
```

`title` is fetched from the DB (trusted), so no injection risk. However a title with many
`%` characters triggers worst-case SQLite LIKE scanning.

**Fix:** escape `%` and `_` in `title` before building the LIKE pattern, or limit title length.

---

## 🟢 Low

### 9. Raw DB errors sent to frontend

`to_ipc_err` forwards raw `rusqlite` error strings to the frontend, which can leak schema
details.

**Fix:** log full errors server-side; return opaque error codes to the frontend.

---

### 10. `ircs://` allowed in `urlTransform`

`ircs://` is whitelisted in `BlockEditor.tsx`. Likely unintentional.

**Fix:** review whether IRC links are an intended feature and remove if not.

---

## Fix Effort Summary

| # | Issue | Difficulty |
|---|-------|-----------|
| 1 | `open_attachment` path traversal | Trivial — `Path::file_name()` |
| 2 | `open_url` scheme validation | Trivial — check scheme prefix |
| 3 | `set_note_image` path validation | Easy |
| 4 | CSP + `rehype-sanitize` | Moderate |
| 5 | Input bounds | Easy |
| 6 | Attachment filename sanitization on insert | Trivial |
| 7 | `set_db_path_setting` path validation | Easy |
| 8 | LIKE pattern escaping | Easy |
| 9 | Opaque error codes | Easy |
| 10 | Remove `ircs://` | Trivial |
