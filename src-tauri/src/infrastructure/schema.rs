use anyhow::Result;
use chrono::NaiveDate;
use rusqlite::{params, Connection};
use std::path::PathBuf;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// DB path resolution
// ---------------------------------------------------------------------------

fn config_path() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("pi-notes");
    std::fs::create_dir_all(&dir).ok();
    dir.join("db_path.conf")
}

pub fn get_db_path() -> PathBuf {
    if let Ok(path) = std::env::var("PI_NOTES_DB_PATH") {
        return PathBuf::from(path);
    }
    if let Ok(s) = std::fs::read_to_string(config_path()) {
        let s = s.trim().to_string();
        if !s.is_empty() {
            return PathBuf::from(s);
        }
    }
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("pi-notes");
    std::fs::create_dir_all(&dir).ok();
    dir.join("notes.db")
}

pub fn save_db_path_config(path: &str) -> Result<()> {
    std::fs::write(config_path(), path)?;
    Ok(())
}

pub fn clear_db_path_config() -> Result<()> {
    let p = config_path();
    if p.exists() {
        std::fs::remove_file(p)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Connection init
// ---------------------------------------------------------------------------

pub fn init() -> Result<Connection> {
    init_at(&get_db_path())
}

pub fn init_at(path: &std::path::Path) -> Result<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous   = NORMAL;
         PRAGMA temp_store    = MEMORY;
         PRAGMA foreign_keys  = ON;",
    )?;
    apply_schema(&conn)?;
    Ok(conn)
}

// ---------------------------------------------------------------------------
// Schema application (idempotent)
// ---------------------------------------------------------------------------

pub fn apply_schema(conn: &Connection) -> Result<()> {
    // Handle very old TEXT-timestamp databases
    migrate_timestamps_if_needed(conn)?;
    // Add columns that were added incrementally to old INTEGER-id databases
    add_legacy_columns_if_needed(conn)?;
    // Create tables that don't exist yet (uses TEXT id schema)
    create_tables_and_fts(conn)?;
    // Migrate INTEGER primary keys → UUID strings (idempotent)
    migrate_ids_to_uuid(conn)?;
    // Add collections support (idempotent)
    add_collection_support_if_needed(conn)?;
    // Rewrite [[wikilinks]] and bare YYYY-MM-DD dates for the live editor
    migrate_content_for_live_editor(conn)?;
    // Fix wikilink URLs to use angle brackets (spaces break bare URLs)
    fix_wikilink_angle_brackets(conn)?;
    // Fix backslash-escaped wikilinks from Milkdown serializer
    fix_escaped_wikilinks(conn)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Table creation (TEXT id schema)
// ---------------------------------------------------------------------------

fn create_tables_and_fts(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS notes (
            id             TEXT    PRIMARY KEY,
            title          TEXT    NOT NULL DEFAULT '',
            content        TEXT    NOT NULL,
            created_at     INTEGER NOT NULL,
            updated_at     INTEGER NOT NULL,
            in_inbox       INTEGER NOT NULL DEFAULT 1,
            linked_note_id TEXT    REFERENCES notes(id) ON DELETE SET NULL,
            image_path     TEXT,
            trashed        INTEGER NOT NULL DEFAULT 0,
            back_of_mind   INTEGER NOT NULL DEFAULT 0,
            snoozed_until  INTEGER
        );

        CREATE TABLE IF NOT EXISTS note_tags (
            note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            tag     TEXT NOT NULL,
            PRIMARY KEY (note_id, tag)
        );

        CREATE TABLE IF NOT EXISTS note_dates (
            note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            date    TEXT NOT NULL,
            PRIMARY KEY (note_id, date)
        );

        CREATE TABLE IF NOT EXISTS note_attachments (
            id          TEXT    PRIMARY KEY,
            note_id     TEXT    NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            filename    TEXT    NOT NULL,
            mime_type   TEXT    NOT NULL,
            data        BLOB    NOT NULL,
            size        INTEGER NOT NULL,
            created_at  INTEGER NOT NULL
        );
        "#,
    )?;
    recreate_fts_and_triggers(conn)?;
    create_indexes(conn)?;
    Ok(())
}

fn recreate_fts_and_triggers(conn: &Connection) -> Result<()> {
    // Drop before recreating so any definition changes are always applied.
    conn.execute_batch(
        r#"
        DROP TRIGGER IF EXISTS notes_ai;
        DROP TRIGGER IF EXISTS notes_ad;
        DROP TRIGGER IF EXISTS notes_au;
        "#,
    )?;
    conn.execute_batch(
        r#"
        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
            content,
            content=notes,
            content_rowid=rowid
        );

        CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
            INSERT INTO notes_fts(rowid, content) VALUES (new.rowid, new.content);
        END;

        CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, content) VALUES('delete', old.rowid, old.content);
        END;

        -- WHEN guard: only update FTS when content actually changes (avoids
        -- FTS churn on flag-only updates like trash / accept / set_image).
        CREATE TRIGGER notes_au AFTER UPDATE OF content ON notes
        WHEN old.content != new.content
        BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, content) VALUES('delete', old.rowid, old.content);
            INSERT INTO notes_fts(rowid, content) VALUES (new.rowid, new.content);
        END;
        "#,
    )?;
    Ok(())
}

fn create_indexes(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_notes_list
            ON notes(in_inbox, trashed, updated_at DESC);

        CREATE INDEX IF NOT EXISTS idx_notes_trash
            ON notes(trashed, updated_at DESC);

        CREATE INDEX IF NOT EXISTS idx_note_tags_tag
            ON note_tags(tag, note_id);

        CREATE INDEX IF NOT EXISTS idx_note_dates_date
            ON note_dates(date);
        "#,
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// UUID migration (idempotent)
// ---------------------------------------------------------------------------

fn migrate_ids_to_uuid(conn: &Connection) -> Result<()> {
    // Check if notes.id is already TEXT — if so, already migrated
    let id_type: String = conn
        .query_row(
            "SELECT type FROM pragma_table_info('notes') WHERE name = 'id'",
            [],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "INTEGER".to_string());

    if id_type.to_uppercase() == "TEXT" {
        return Ok(());
    }

    // Build note id mapping: old INTEGER → new UUID v7
    let old_note_ids: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT id FROM notes")?;
        let ids: Vec<i64> = stmt
            .query_map([], |row| row.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        ids
    };

    conn.execute_batch("CREATE TEMP TABLE note_id_map (old_id INTEGER, new_id TEXT)")?;
    for old_id in &old_note_ids {
        let new_uuid = Uuid::now_v7().to_string();
        conn.execute(
            "INSERT INTO temp.note_id_map VALUES (?1, ?2)",
            params![old_id, new_uuid],
        )?;
    }

    // Build attachment id mapping
    let old_attach_ids: Vec<i64> = {
        let stmt = conn.prepare("SELECT id FROM note_attachments");
        match stmt {
            Ok(mut s) => {
                let ids: Vec<i64> = s
                    .query_map([], |row| row.get(0))?
                    .collect::<rusqlite::Result<_>>()?;
                ids
            }
            Err(_) => vec![], // table may not exist yet
        }
    };

    conn.execute_batch("CREATE TEMP TABLE attach_id_map (old_id INTEGER, new_id TEXT)")?;
    for old_id in &old_attach_ids {
        let new_uuid = Uuid::now_v7().to_string();
        conn.execute(
            "INSERT INTO temp.attach_id_map VALUES (?1, ?2)",
            params![old_id, new_uuid],
        )?;
    }

    // Disable FK checks while we rebuild the schema
    conn.execute_batch("PRAGMA foreign_keys = OFF")?;

    conn.execute_batch(
        r#"
        BEGIN;

        -- New notes table with TEXT id
        CREATE TABLE notes_new (
            id             TEXT    PRIMARY KEY,
            title          TEXT    NOT NULL DEFAULT '',
            content        TEXT    NOT NULL,
            created_at     INTEGER NOT NULL,
            updated_at     INTEGER NOT NULL,
            in_inbox       INTEGER NOT NULL DEFAULT 1,
            linked_note_id TEXT    REFERENCES notes_new(id) ON DELETE SET NULL,
            image_path     TEXT,
            trashed        INTEGER NOT NULL DEFAULT 0,
            back_of_mind   INTEGER NOT NULL DEFAULT 0,
            snoozed_until  INTEGER
        );

        INSERT INTO notes_new (id, title, content, created_at, updated_at, in_inbox,
                               linked_note_id, image_path, trashed, back_of_mind, snoozed_until)
        SELECT m.new_id, n.title, n.content, n.created_at, n.updated_at, n.in_inbox,
               lm.new_id, n.image_path, n.trashed, n.back_of_mind, n.snoozed_until
        FROM notes n
        JOIN temp.note_id_map m ON m.old_id = n.id
        LEFT JOIN temp.note_id_map lm ON lm.old_id = n.linked_note_id;

        -- New note_tags
        CREATE TABLE note_tags_new (
            note_id TEXT NOT NULL REFERENCES notes_new(id) ON DELETE CASCADE,
            tag     TEXT NOT NULL,
            PRIMARY KEY (note_id, tag)
        );

        INSERT INTO note_tags_new (note_id, tag)
        SELECT m.new_id, t.tag
        FROM note_tags t
        JOIN temp.note_id_map m ON m.old_id = t.note_id;

        -- New note_dates
        CREATE TABLE note_dates_new (
            note_id TEXT NOT NULL REFERENCES notes_new(id) ON DELETE CASCADE,
            date    TEXT NOT NULL,
            PRIMARY KEY (note_id, date)
        );

        INSERT INTO note_dates_new (note_id, date)
        SELECT m.new_id, d.date
        FROM note_dates d
        JOIN temp.note_id_map m ON m.old_id = d.note_id;

        DROP TABLE IF EXISTS notes_fts;
        DROP TRIGGER IF EXISTS notes_ai;
        DROP TRIGGER IF EXISTS notes_ad;
        DROP TRIGGER IF EXISTS notes_au;
        DROP TABLE notes;
        DROP TABLE note_tags;
        DROP TABLE note_dates;

        ALTER TABLE notes_new RENAME TO notes;
        ALTER TABLE note_tags_new RENAME TO note_tags;
        ALTER TABLE note_dates_new RENAME TO note_dates;

        COMMIT;
        "#,
    )?;

    // Migrate attachments separately (table may not exist)
    let has_attachments: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='note_attachments'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n > 0)
        .unwrap_or(false);

    if has_attachments {
        conn.execute_batch(
            r#"
            BEGIN;

            CREATE TABLE note_attachments_new (
                id          TEXT    PRIMARY KEY,
                note_id     TEXT    NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                filename    TEXT    NOT NULL,
                mime_type   TEXT    NOT NULL,
                data        BLOB    NOT NULL,
                size        INTEGER NOT NULL,
                created_at  INTEGER NOT NULL
            );

            INSERT INTO note_attachments_new (id, note_id, filename, mime_type, data, size, created_at)
            SELECT am.new_id, nm.new_id, a.filename, a.mime_type, a.data, a.size, a.created_at
            FROM note_attachments a
            JOIN temp.attach_id_map am ON am.old_id = a.id
            JOIN temp.note_id_map nm ON nm.old_id = a.note_id;

            DROP TABLE note_attachments;
            ALTER TABLE note_attachments_new RENAME TO note_attachments;

            COMMIT;
            "#,
        )?;
    }

    conn.execute_batch("PRAGMA foreign_keys = ON")?;

    recreate_fts_and_triggers(conn)?;
    create_indexes(conn)?;
    conn.execute_batch("INSERT INTO notes_fts(notes_fts) VALUES('rebuild');")?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Legacy migrations (for databases created before this refactoring)
// ---------------------------------------------------------------------------

fn add_legacy_columns_if_needed(conn: &Connection) -> Result<()> {
    // Only run if the notes table exists and has INTEGER id (old schema)
    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='notes'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n > 0)
        .unwrap_or(false);

    if !table_exists {
        return Ok(());
    }

    for (col, ddl) in &[
        ("image_path", "ALTER TABLE notes ADD COLUMN image_path TEXT"),
        (
            "title",
            "ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT ''",
        ),
        (
            "trashed",
            "ALTER TABLE notes ADD COLUMN trashed INTEGER NOT NULL DEFAULT 0",
        ),
        (
            "back_of_mind",
            "ALTER TABLE notes ADD COLUMN back_of_mind INTEGER NOT NULL DEFAULT 0",
        ),
        (
            "snoozed_until",
            "ALTER TABLE notes ADD COLUMN snoozed_until INTEGER",
        ),
    ] {
        let has: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('notes') WHERE name = ?1",
                params![col],
                |row| row.get::<_, i64>(0),
            )
            .map(|n| n > 0)
            .unwrap_or(false);
        if !has {
            conn.execute(ddl, [])?;
        }
    }

    // Create attachments table if missing (old schema, INTEGER ids)
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS note_attachments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            filename    TEXT    NOT NULL,
            mime_type   TEXT    NOT NULL,
            data        BLOB    NOT NULL,
            size        INTEGER NOT NULL,
            created_at  INTEGER NOT NULL
        );",
    )?;

    Ok(())
}

fn add_collection_support_if_needed(conn: &Connection) -> Result<()> {
    // Create collections table
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS collections (
            id         TEXT    PRIMARY KEY,
            name       TEXT    NOT NULL UNIQUE,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );",
    )?;

    // Add collection_id column to notes if missing
    let has_col: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('notes') WHERE name = 'collection_id'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n > 0)
        .unwrap_or(false);

    if !has_col {
        conn.execute_batch(
            "ALTER TABLE notes ADD COLUMN collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL;",
        )?;
    }

    // Add index
    conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_notes_collection ON notes(collection_id);")?;

    Ok(())
}

fn migrate_timestamps_if_needed(conn: &Connection) -> Result<()> {
    let col_type: rusqlite::Result<String> = conn.query_row(
        "SELECT type FROM pragma_table_info('notes') WHERE name = 'created_at'",
        [],
        |row| row.get(0),
    );

    match col_type {
        Ok(t) if t.to_lowercase() == "text" => {}
        _ => return Ok(()),
    }

    conn.execute("PRAGMA foreign_keys = OFF", [])?;
    conn.execute_batch(
        r#"
        BEGIN;

        CREATE TABLE notes_new (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            content        TEXT    NOT NULL,
            created_at     INTEGER NOT NULL,
            updated_at     INTEGER NOT NULL,
            in_inbox       INTEGER NOT NULL DEFAULT 1,
            linked_note_id INTEGER REFERENCES notes_new(id) ON DELETE SET NULL
        );

        INSERT INTO notes_new (id, content, created_at, updated_at, in_inbox, linked_note_id)
        SELECT
            id, content,
            CAST(strftime('%s', created_at) AS INTEGER) * 1000,
            CAST(strftime('%s', updated_at) AS INTEGER) * 1000,
            in_inbox,
            linked_note_id
        FROM notes;

        DROP TABLE notes;
        DROP TABLE IF EXISTS notes_fts;

        ALTER TABLE notes_new RENAME TO notes;

        COMMIT;
        "#,
    )?;
    conn.execute("PRAGMA foreign_keys = ON", [])?;

    create_tables_and_fts(conn)?;
    conn.execute_batch("INSERT INTO notes_fts(notes_fts) VALUES('rebuild');")?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Content migration for live editor (user_version 0 → 1)
// ---------------------------------------------------------------------------
// Rewrites note content:
//   [[title]]       → [title](wikilink:title)
//   2026-03-12      → [Mar 12, 2026](date:2026-03-12)

fn migrate_content_for_live_editor(conn: &Connection) -> Result<()> {
    let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version >= 1 {
        return Ok(());
    }

    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='notes'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n > 0)
        .unwrap_or(false);

    if !table_exists {
        conn.execute_batch("PRAGMA user_version = 1")?;
        return Ok(());
    }

    let mut stmt = conn.prepare("SELECT id, content FROM notes")?;
    let notes: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;

    let mut update_stmt = conn.prepare("UPDATE notes SET content = ?1 WHERE id = ?2")?;

    for (id, content) in &notes {
        let rewritten = rewrite_wikilinks(content);
        let rewritten = rewrite_dates(&rewritten);
        if rewritten != *content {
            update_stmt.execute(params![rewritten, id])?;
        }
    }

    conn.execute_batch("INSERT INTO notes_fts(notes_fts) VALUES('rebuild');")?;
    conn.execute_batch("PRAGMA user_version = 1")?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Fix wikilink angle brackets (user_version 1 → 2)
// ---------------------------------------------------------------------------
// Fixes `](wikilink:title)` → `](<wikilink:title>)` for links that were
// created without angle brackets (spaces in URLs break CommonMark parsing).

fn fix_wikilink_angle_brackets(conn: &Connection) -> Result<()> {
    let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version >= 2 {
        return Ok(());
    }

    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='notes'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n > 0)
        .unwrap_or(false);

    if !table_exists {
        conn.execute_batch("PRAGMA user_version = 2")?;
        return Ok(());
    }

    // Only update notes that have bare `](wikilink:` (without angle brackets)
    conn.execute(
        r#"UPDATE notes
           SET content = REPLACE(content, '](wikilink:', '](<wikilink:')
           WHERE instr(content, '](wikilink:') > 0
             AND instr(content, '](<wikilink:') = 0"#,
        [],
    )?;
    // Fix the closing: `)` after the title needs `>)` instead.
    // We can't do this with a single REPLACE because we'd match all `)`.
    // Instead, load remaining notes that have `](<wikilink:` but are missing `>)`.
    let mut stmt =
        conn.prepare("SELECT id, content FROM notes WHERE instr(content, '](<wikilink:') > 0")?;
    let notes: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;

    let mut update_stmt = conn.prepare("UPDATE notes SET content = ?1 WHERE id = ?2")?;
    for (id, content) in &notes {
        let fixed = add_wikilink_closing_brackets(content);
        if fixed != *content {
            update_stmt.execute(params![fixed, id])?;
        }
    }

    conn.execute_batch("INSERT INTO notes_fts(notes_fts) VALUES('rebuild');")?;
    conn.execute_batch("PRAGMA user_version = 2")?;
    Ok(())
}

/// For each `](<wikilink:TITLE)` (missing closing `>`), fix to `](<wikilink:TITLE>)`.
fn add_wikilink_closing_brackets(content: &str) -> String {
    let needle = "](<wikilink:";
    let mut result = String::with_capacity(content.len());
    let mut rest = content;

    while let Some(start) = rest.find(needle) {
        result.push_str(&rest[..start + needle.len()]);
        rest = &rest[start + needle.len()..];
        // Find the closing `)` — that's the end of the URL
        if let Some(close) = rest.find(')') {
            let title_part = &rest[..close];
            if title_part.ends_with('>') {
                // Already has angle bracket — copy as-is
                result.push_str(&rest[..=close]);
            } else {
                // Add closing `>` before `)`
                result.push_str(title_part);
                result.push('>');
                result.push(')');
            }
            rest = &rest[close + 1..];
        }
    }
    result.push_str(rest);
    result
}

// ---------------------------------------------------------------------------
// Fix escaped wikilinks (user_version 2 → 3)
// ---------------------------------------------------------------------------
// Milkdown's serializer sometimes escapes wikilinks as:
//   \[title]\(wikilink:title)
// This migration converts them to proper markdown links:
//   [title](<wikilink:title>)

fn fix_escaped_wikilinks(conn: &Connection) -> Result<()> {
    let version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if version >= 3 {
        return Ok(());
    }

    let table_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='notes'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n > 0)
        .unwrap_or(false);

    if !table_exists {
        conn.execute_batch("PRAGMA user_version = 3")?;
        return Ok(());
    }

    let mut stmt =
        conn.prepare(r"SELECT id, content FROM notes WHERE content LIKE '%\(wikilink:%'")?;
    let notes: Vec<(String, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;

    let mut update_stmt = conn.prepare("UPDATE notes SET content = ?1 WHERE id = ?2")?;
    for (id, content) in &notes {
        let fixed = unescape_wikilinks(content);
        if fixed != *content {
            update_stmt.execute(params![fixed, id])?;
        }
    }

    if !notes.is_empty() {
        conn.execute_batch("INSERT INTO notes_fts(notes_fts) VALUES('rebuild');")?;
    }
    conn.execute_batch("PRAGMA user_version = 3")?;
    Ok(())
}

/// Convert `\[title]\(wikilink:title)` to `[title](<wikilink:title>)`.
fn unescape_wikilinks(content: &str) -> String {
    let needle = r"\(wikilink:";
    let mut result = String::with_capacity(content.len());
    let mut rest = content;

    while let Some(idx) = rest.find(needle) {
        // Find the closing unescaped `)` after the needle
        let after_needle = &rest[idx + needle.len()..];
        let close = match after_needle.find(')') {
            Some(c) => c,
            None => {
                result.push_str(&rest[..idx + needle.len()]);
                rest = after_needle;
                continue;
            }
        };
        let title = &after_needle[..close];

        // Look backwards for `\[title]` — the display text portion
        let display_pattern = format!(r"\[{title}]");
        let before = &rest[..idx];
        if before.ends_with(&display_pattern) {
            // Strip the escaped display text and rebuild as a proper link
            result.push_str(&before[..before.len() - display_pattern.len()]);
            result.push_str(&format!("[{title}](<wikilink:{title}>)"));
        } else {
            // No matching display text — just fix the URL part
            result.push_str(&rest[..idx]);
            result.push_str(&format!("(<wikilink:{title}>)"));
        }
        rest = &after_needle[close + 1..];
    }
    result.push_str(rest);
    result
}

/// Replace `[[title]]` with `[title](<wikilink:title>)`.
/// Angle brackets are required because titles may contain spaces.
fn rewrite_wikilinks(content: &str) -> String {
    let b = content.as_bytes();
    let len = b.len();
    let mut out = Vec::with_capacity(len);
    let mut i = 0;

    while i < len {
        if i + 1 < len && b[i] == b'[' && b[i + 1] == b'[' {
            let start = i + 2;
            let mut end = None;
            let mut j = start;
            while j + 1 < len {
                if b[j] == b'\n' {
                    break;
                }
                if b[j] == b']' && b[j + 1] == b']' {
                    end = Some(j);
                    break;
                }
                j += 1;
            }
            if let Some(end_pos) = end {
                let title = &content[start..end_pos];
                if !title.is_empty() {
                    let replacement = format!("[{title}](<wikilink:{title}>)");
                    out.extend_from_slice(replacement.as_bytes());
                    i = end_pos + 2;
                    continue;
                }
            }
        }
        out.push(b[i]);
        i += 1;
    }

    String::from_utf8(out).unwrap_or_else(|_| content.to_string())
}

/// Replace bare `YYYY-MM-DD` dates with `[Mon DD, YYYY](date:YYYY-MM-DD)`.
/// Skips dates already inside a `(date:...)` link.
fn rewrite_dates(content: &str) -> String {
    let b = content.as_bytes();
    let len = b.len();
    let mut out = Vec::with_capacity(len);
    let mut i = 0;

    while i < len {
        if i + 10 <= len
            && b[i..i + 4].iter().all(|c| c.is_ascii_digit())
            && b[i + 4] == b'-'
            && b[i + 5..i + 7].iter().all(|c| c.is_ascii_digit())
            && b[i + 7] == b'-'
            && b[i + 8..i + 10].iter().all(|c| c.is_ascii_digit())
        {
            let before_ok = i == 0 || !b[i - 1].is_ascii_digit();
            let after_ok = i + 10 >= len || !b[i + 10].is_ascii_digit();
            let preceded_by_date_scheme = i >= 5 && &b[i - 5..i] == b"date:";

            if before_ok && after_ok && !preceded_by_date_scheme {
                let year: i32 = content[i..i + 4].parse().unwrap_or(0);
                let month: u32 = content[i + 5..i + 7].parse().unwrap_or(0);
                let day: u32 = content[i + 8..i + 10].parse().unwrap_or(0);

                if let Some(date) = NaiveDate::from_ymd_opt(year, month, day) {
                    let iso = &content[i..i + 10];
                    let label = date.format("%b %-d, %Y").to_string();
                    let replacement = format!("[{label}](date:{iso})");
                    out.extend_from_slice(replacement.as_bytes());
                    i += 10;
                    continue;
                }
            }
        }
        out.push(b[i]);
        i += 1;
    }

    String::from_utf8(out).unwrap_or_else(|_| content.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrite_wikilinks_basic() {
        assert_eq!(
            rewrite_wikilinks("see [[My Note]] here"),
            "see [My Note](<wikilink:My Note>) here"
        );
    }

    #[test]
    fn rewrite_wikilinks_multiple() {
        assert_eq!(
            rewrite_wikilinks("[[A]] and [[B]]"),
            "[A](<wikilink:A>) and [B](<wikilink:B>)"
        );
    }

    #[test]
    fn rewrite_wikilinks_no_match() {
        assert_eq!(rewrite_wikilinks("no links here"), "no links here");
    }

    #[test]
    fn rewrite_wikilinks_unclosed() {
        assert_eq!(rewrite_wikilinks("see [[broken"), "see [[broken");
    }

    #[test]
    fn rewrite_wikilinks_newline_inside() {
        assert_eq!(
            rewrite_wikilinks("see [[broken\nlink]]"),
            "see [[broken\nlink]]"
        );
    }

    #[test]
    fn rewrite_dates_basic() {
        assert_eq!(
            rewrite_dates("on 2026-03-12 we meet"),
            "on [Mar 12, 2026](date:2026-03-12) we meet"
        );
    }

    #[test]
    fn rewrite_dates_multiple() {
        assert_eq!(
            rewrite_dates("2024-01-01 and 2024-12-25"),
            "[Jan 1, 2024](date:2024-01-01) and [Dec 25, 2024](date:2024-12-25)"
        );
    }

    #[test]
    fn rewrite_dates_skips_already_converted() {
        let input = "[Mar 12, 2026](date:2026-03-12)";
        assert_eq!(rewrite_dates(input), input);
    }

    #[test]
    fn rewrite_dates_invalid_date() {
        assert_eq!(rewrite_dates("bad 2024-02-30 date"), "bad 2024-02-30 date");
    }

    #[test]
    fn rewrite_dates_adjacent_digits() {
        assert_eq!(rewrite_dates("12024-03-15"), "12024-03-15");
    }

    #[test]
    fn rewrite_combined() {
        let input = "see [[Meeting Notes]] on 2026-03-12";
        let result = rewrite_dates(&rewrite_wikilinks(input));
        assert_eq!(
            result,
            "see [Meeting Notes](<wikilink:Meeting Notes>) on [Mar 12, 2026](date:2026-03-12)"
        );
    }

    #[test]
    fn migrate_content_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        apply_schema(&conn).unwrap();
        conn.execute(
            "INSERT INTO notes (id, title, content, created_at, updated_at)
             VALUES ('a', 'T', 'see [[Foo]] on 2026-03-12', 0, 0)",
            [],
        )
        .unwrap();
        // Reset user_version so migration runs
        conn.execute_batch("PRAGMA user_version = 0").unwrap();
        migrate_content_for_live_editor(&conn).unwrap();
        let content: String = conn
            .query_row("SELECT content FROM notes WHERE id = 'a'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(
            content,
            "see [Foo](<wikilink:Foo>) on [Mar 12, 2026](date:2026-03-12)"
        );

        // Run again — should be a no-op (already at user_version 1)
        conn.execute_batch("PRAGMA user_version = 0").unwrap();
        migrate_content_for_live_editor(&conn).unwrap();
        let content2: String = conn
            .query_row("SELECT content FROM notes WHERE id = 'a'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(content, content2);
    }

    #[test]
    fn add_wikilink_closing_brackets_fixes_bare() {
        assert_eq!(
            add_wikilink_closing_brackets("see [Foo](<wikilink:Foo) here"),
            "see [Foo](<wikilink:Foo>) here"
        );
    }

    #[test]
    fn add_wikilink_closing_brackets_with_spaces() {
        assert_eq!(
            add_wikilink_closing_brackets("[My Note](<wikilink:My Note)"),
            "[My Note](<wikilink:My Note>)"
        );
    }

    #[test]
    fn add_wikilink_closing_brackets_already_correct() {
        let input = "[Foo](<wikilink:Foo>) bar";
        assert_eq!(add_wikilink_closing_brackets(input), input);
    }

    #[test]
    fn add_wikilink_closing_brackets_multiple() {
        assert_eq!(
            add_wikilink_closing_brackets("[A](<wikilink:A) and [B](<wikilink:B)"),
            "[A](<wikilink:A>) and [B](<wikilink:B>)"
        );
    }

    #[test]
    fn fix_wikilink_angle_brackets_migration() {
        let conn = Connection::open_in_memory().unwrap();
        apply_schema(&conn).unwrap();
        // Insert content with bare wikilinks (no angle brackets)
        conn.execute(
            "INSERT INTO notes (id, title, content, created_at, updated_at)
             VALUES ('b', 'T', 'see [Foo](wikilink:Foo) and [Bar Baz](wikilink:Bar Baz)', 0, 0)",
            [],
        )
        .unwrap();
        // Set version to 1 so only the angle-bracket fix runs
        conn.execute_batch("PRAGMA user_version = 1").unwrap();
        fix_wikilink_angle_brackets(&conn).unwrap();
        let content: String = conn
            .query_row("SELECT content FROM notes WHERE id = 'b'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(
            content,
            "see [Foo](<wikilink:Foo>) and [Bar Baz](<wikilink:Bar Baz>)"
        );
    }

    #[test]
    fn unescape_wikilinks_basic() {
        assert_eq!(
            unescape_wikilinks(
                r"See \[Consulta Tricologista]\(wikilink:Consulta Tricologista) here"
            ),
            "See [Consulta Tricologista](<wikilink:Consulta Tricologista>) here"
        );
    }

    #[test]
    fn unescape_wikilinks_already_correct() {
        let input = "See [Foo](<wikilink:Foo>) here";
        assert_eq!(unescape_wikilinks(input), input);
    }

    #[test]
    fn unescape_wikilinks_multiple() {
        assert_eq!(
            unescape_wikilinks(r"\[A]\(wikilink:A) and \[B]\(wikilink:B)"),
            "[A](<wikilink:A>) and [B](<wikilink:B>)"
        );
    }

    #[test]
    fn fix_escaped_wikilinks_migration() {
        let conn = Connection::open_in_memory().unwrap();
        apply_schema(&conn).unwrap();
        conn.execute(
            r"INSERT INTO notes (id, title, content, created_at, updated_at)
             VALUES ('c', 'T', 'see \[My Note]\(wikilink:My Note) here', 0, 0)",
            [],
        )
        .unwrap();
        conn.execute_batch("PRAGMA user_version = 2").unwrap();
        fix_escaped_wikilinks(&conn).unwrap();
        let content: String = conn
            .query_row("SELECT content FROM notes WHERE id = 'c'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(content, "see [My Note](<wikilink:My Note>) here");
    }
}
