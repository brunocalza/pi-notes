use anyhow::Result;
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
