use anyhow::Result;
use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use std::path::PathBuf;

use crate::models::{AttachmentMeta, Note};
use crate::tags::normalize_tag;

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

pub fn init() -> Result<Connection> {
    init_at(&get_db_path())
}

pub fn init_at(path: &std::path::Path) -> Result<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    create_schema(&conn)?;
    migrate_timestamps_if_needed(&conn)?;
    add_image_column_if_needed(&conn)?;
    add_title_column_if_needed(&conn)?;
    add_trashed_column_if_needed(&conn)?;
    add_back_of_mind_columns_if_needed(&conn)?;
    create_attachments_table_if_needed(&conn)?;
    Ok(conn)
}

fn add_back_of_mind_columns_if_needed(conn: &Connection) -> Result<()> {
    let has_bom: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('notes') WHERE name = 'back_of_mind'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n > 0)
        .unwrap_or(false);

    if !has_bom {
        conn.execute(
            "ALTER TABLE notes ADD COLUMN back_of_mind INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
        conn.execute("ALTER TABLE notes ADD COLUMN snoozed_until INTEGER", [])?;
    }
    Ok(())
}

fn add_trashed_column_if_needed(conn: &Connection) -> Result<()> {
    let has_col: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('notes') WHERE name = 'trashed'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n > 0)
        .unwrap_or(false);

    if !has_col {
        conn.execute(
            "ALTER TABLE notes ADD COLUMN trashed INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }
    Ok(())
}

fn add_title_column_if_needed(conn: &Connection) -> Result<()> {
    let has_col: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('notes') WHERE name = 'title'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n > 0)
        .unwrap_or(false);

    if !has_col {
        conn.execute(
            "ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }
    Ok(())
}

fn add_image_column_if_needed(conn: &Connection) -> Result<()> {
    let has_col: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('notes') WHERE name = 'image_path'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n > 0)
        .unwrap_or(false);

    if !has_col {
        conn.execute("ALTER TABLE notes ADD COLUMN image_path TEXT", [])?;
    }
    Ok(())
}

/// Migrates created_at / updated_at from the old TEXT format
/// ("YYYY-MM-DD HH:MM:SS") to INTEGER Unix milliseconds.
/// Safe to call on an already-migrated database — it's a no-op then.
fn migrate_timestamps_if_needed(conn: &Connection) -> Result<()> {
    let col_type: rusqlite::Result<String> = conn.query_row(
        "SELECT type FROM pragma_table_info('notes') WHERE name = 'created_at'",
        [],
        |row| row.get(0),
    );

    match col_type {
        Ok(t) if t.to_lowercase() == "text" => {}
        _ => return Ok(()), // already on new schema or table doesn't exist
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

    // Recreate FTS + triggers (they were dropped with the old notes table)
    create_schema(conn)?;
    conn.execute_batch("INSERT INTO notes_fts(notes_fts) VALUES('rebuild');")?;

    Ok(())
}

fn create_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS notes (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            title          TEXT    NOT NULL DEFAULT '',
            content        TEXT    NOT NULL,
            created_at     INTEGER NOT NULL,
            updated_at     INTEGER NOT NULL,
            in_inbox       INTEGER NOT NULL DEFAULT 1,
            linked_note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
            image_path     TEXT,
            trashed        INTEGER NOT NULL DEFAULT 0,
            back_of_mind   INTEGER NOT NULL DEFAULT 0,
            snoozed_until  INTEGER
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
            content,
            content=notes,
            content_rowid=id
        );

        CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
            INSERT INTO notes_fts(rowid, content) VALUES (new.id, new.content);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, content) VALUES('delete', old.id, old.content);
        END;

        CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE OF content ON notes BEGIN
            INSERT INTO notes_fts(notes_fts, rowid, content) VALUES('delete', old.id, old.content);
            INSERT INTO notes_fts(rowid, content) VALUES (new.id, new.content);
        END;

        CREATE TABLE IF NOT EXISTS note_tags (
            note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            tag     TEXT    NOT NULL,
            PRIMARY KEY (note_id, tag)
        );
        "#,
    )?;
    Ok(())
}

fn ms_to_dt(ms: i64) -> DateTime<Utc> {
    DateTime::from_timestamp_millis(ms).unwrap_or_else(Utc::now)
}

fn row_to_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<Note> {
    // columns: 0=id 1=title 2=content 3=created_at 4=updated_at 5=in_inbox 6=linked_note_id
    //          7=image_path 8=trashed 9=tags
    let tags_csv: Option<String> = row.get(9)?;
    let tags = tags_csv
        .map(|s| {
            s.split(',')
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty())
                .collect()
        })
        .unwrap_or_default();

    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        created_at: ms_to_dt(row.get(3)?),
        updated_at: ms_to_dt(row.get(4)?),
        in_inbox: row.get::<_, i32>(5)? != 0,
        trashed: row.get::<_, i32>(8)? != 0,
        linked_note_id: row.get(6)?,
        image_path: row.get(7)?,
        tags,
    })
}

// All note queries join note_tags and aggregate.
// Columns: 0=id 1=title 2=content 3=created_at 4=updated_at 5=in_inbox 6=linked_note_id
//          7=image_path 8=trashed 9=tags
const SELECT: &str = "
    SELECT n.id, n.title, n.content, n.created_at, n.updated_at, n.in_inbox, n.linked_note_id,
           n.image_path, n.trashed, GROUP_CONCAT(t.tag, ',') as tags
    FROM notes n
    LEFT JOIN note_tags t ON t.note_id = n.id";

pub fn insert_note(conn: &Connection, title: &str, content: &str, tags: &[String]) -> Result<i64> {
    let now = Utc::now().timestamp_millis();
    conn.execute(
        "INSERT INTO notes (title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        params![title, content, now],
    )?;
    let id = conn.last_insert_rowid();
    sync_tags(conn, id, tags)?;
    Ok(id)
}

pub fn get_note(conn: &Connection, id: i64) -> Result<Option<Note>> {
    let sql = format!("{SELECT} WHERE n.id = ?1 GROUP BY n.id");
    let mut stmt = conn.prepare(&sql)?;
    Ok(stmt.query_row(params![id], row_to_note).ok())
}

pub fn get_inbox(conn: &Connection) -> Result<Vec<Note>> {
    let sql = format!(
        "{SELECT} WHERE n.in_inbox = 1 AND n.trashed = 0 GROUP BY n.id ORDER BY n.created_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map([], row_to_note)?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}

pub fn accept_note(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("UPDATE notes SET in_inbox = 0 WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn trash_note(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("UPDATE notes SET trashed = 1 WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn restore_note(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("UPDATE notes SET trashed = 0 WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn move_to_inbox(conn: &Connection, id: i64) -> Result<()> {
    conn.execute(
        "UPDATE notes SET trashed = 0, in_inbox = 1 WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn delete_note(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn empty_trash(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM notes WHERE trashed = 1", [])?;
    Ok(())
}

pub fn get_trash(conn: &Connection) -> Result<Vec<Note>> {
    let sql = format!("{SELECT} WHERE n.trashed = 1 GROUP BY n.id ORDER BY n.created_at DESC");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map([], row_to_note)?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}

pub fn set_note_image(conn: &Connection, id: i64, path: &str) -> Result<()> {
    conn.execute(
        "UPDATE notes SET image_path = ?1 WHERE id = ?2",
        params![path, id],
    )?;
    Ok(())
}

pub fn update_note(
    conn: &Connection,
    id: i64,
    title: &str,
    content: &str,
    tags: &[String],
) -> Result<()> {
    let now = Utc::now().timestamp_millis();
    conn.execute(
        "UPDATE notes SET title = ?1, content = ?2, updated_at = ?3 WHERE id = ?4",
        params![title, content, now, id],
    )?;
    sync_tags(conn, id, tags)?;
    Ok(())
}

pub fn get_note_by_title(conn: &Connection, title: &str) -> Result<Option<Note>> {
    let sql = format!("{SELECT} WHERE lower(n.title) = lower(?1) GROUP BY n.id LIMIT 1");
    let mut stmt = conn.prepare(&sql)?;
    Ok(stmt.query_row(params![title], row_to_note).ok())
}

pub fn search_notes(conn: &Connection, query: &str) -> Result<Vec<Note>> {
    let fts_query = prepare_fts_query(query);
    let like_query = format!("%{}%", query.trim());
    let sql = format!(
        "{SELECT}
         WHERE n.in_inbox = 0 AND n.trashed = 0
           AND (n.id IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?1)
                OR lower(n.title) LIKE lower(?2))
         GROUP BY n.id
         ORDER BY n.created_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params![fts_query, like_query], row_to_note)?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}

pub fn get_recent_notes(conn: &Connection, limit: i64) -> Result<Vec<Note>> {
    let sql = format!("{SELECT} WHERE n.trashed = 0 AND n.in_inbox = 0 GROUP BY n.id ORDER BY n.updated_at DESC LIMIT ?1");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params![limit], row_to_note)?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}

pub fn list_notes(conn: &Connection) -> Result<Vec<Note>> {
    let sql = format!(
        "{SELECT} WHERE n.in_inbox = 0 AND n.trashed = 0 GROUP BY n.id ORDER BY n.created_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map([], row_to_note)?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}

pub fn get_all_tags(conn: &Connection) -> Result<Vec<(String, i64)>> {
    let mut stmt = conn.prepare(
        "SELECT t.tag, COUNT(*) FROM note_tags t
         JOIN notes n ON n.id = t.note_id
         WHERE n.in_inbox = 0 AND n.trashed = 0
         GROUP BY t.tag ORDER BY 1",
    )?;
    let rows = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}

pub fn rename_tag(conn: &Connection, old_tag: &str, new_tag: &str) -> Result<()> {
    let new_tag = normalize_tag(new_tag);
    if new_tag.is_empty() || new_tag == old_tag {
        return Ok(());
    }
    conn.execute(
        "DELETE FROM note_tags WHERE tag = ?1
         AND note_id IN (SELECT note_id FROM note_tags WHERE tag = ?2)",
        params![old_tag, new_tag],
    )?;
    conn.execute(
        "UPDATE note_tags SET tag = ?1 WHERE tag = ?2",
        params![new_tag, old_tag],
    )?;
    Ok(())
}

pub fn delete_tag(conn: &Connection, tag: &str) -> Result<()> {
    conn.execute("DELETE FROM note_tags WHERE tag = ?1", params![tag])?;
    Ok(())
}

pub fn get_all_note_titles(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT title FROM notes WHERE title != '' AND trashed = 0 ORDER BY title COLLATE NOCASE",
    )?;
    let rows = stmt
        .query_map([], |row| row.get(0))?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}

pub fn get_notes_by_tag(conn: &Connection, tag: &str) -> Result<Vec<Note>> {
    let tag = tag.trim_start_matches('#');
    let sql = format!(
        "{SELECT}
         WHERE n.in_inbox = 0 AND n.trashed = 0
           AND n.id IN (SELECT note_id FROM note_tags WHERE tag = ?1)
         GROUP BY n.id
         ORDER BY n.created_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params![tag], row_to_note)?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}

pub fn get_backlinks(conn: &Connection, id: i64) -> Result<Vec<Note>> {
    let title: String = match conn.query_row(
        "SELECT title FROM notes WHERE id = ?1",
        params![id],
        |row| row.get(0),
    ) {
        Ok(t) => t,
        Err(_) => return Ok(vec![]),
    };
    if title.is_empty() {
        return Ok(vec![]);
    }
    let pattern = format!("%[[{}]]%", title);
    let sql = format!(
        "{SELECT}
         WHERE n.id != ?2 AND n.trashed = 0 AND n.content LIKE ?1
         GROUP BY n.id
         ORDER BY n.updated_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map(params![pattern, id], row_to_note)?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}

fn sync_tags(conn: &Connection, note_id: i64, tags: &[String]) -> Result<()> {
    conn.execute("DELETE FROM note_tags WHERE note_id = ?1", params![note_id])?;
    for tag in tags {
        let tag = normalize_tag(tag);
        if !tag.is_empty() {
            conn.execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?1, ?2)",
                params![note_id, tag],
            )?;
        }
    }
    Ok(())
}

fn create_attachments_table_if_needed(conn: &Connection) -> Result<()> {
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

pub fn add_attachment(
    conn: &Connection,
    note_id: i64,
    filename: &str,
    mime_type: &str,
    data: &[u8],
) -> Result<i64> {
    let now = Utc::now().timestamp_millis();
    let size = data.len() as i64;
    conn.execute(
        "INSERT INTO note_attachments (note_id, filename, mime_type, data, size, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![note_id, filename, mime_type, data, size, now],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn get_attachments(conn: &Connection, note_id: i64) -> Result<Vec<AttachmentMeta>> {
    let mut stmt = conn.prepare(
        "SELECT id, note_id, filename, mime_type, size, created_at FROM note_attachments WHERE note_id = ?1 ORDER BY created_at ASC",
    )?;
    let rows = stmt
        .query_map(params![note_id], |row| {
            let created_ms: i64 = row.get(5)?;
            Ok(AttachmentMeta {
                id: row.get(0)?,
                note_id: row.get(1)?,
                filename: row.get(2)?,
                mime_type: row.get(3)?,
                size: row.get(4)?,
                created_at: ms_to_dt(created_ms),
            })
        })?
        .collect::<rusqlite::Result<_>>()?;
    Ok(rows)
}

pub fn get_attachment_meta(conn: &Connection, id: i64) -> Result<Option<AttachmentMeta>> {
    let mut stmt = conn.prepare(
        "SELECT id, note_id, filename, mime_type, size, created_at FROM note_attachments WHERE id = ?1",
    )?;
    Ok(stmt
        .query_row(params![id], |row| {
            let created_ms: i64 = row.get(5)?;
            Ok(AttachmentMeta {
                id: row.get(0)?,
                note_id: row.get(1)?,
                filename: row.get(2)?,
                mime_type: row.get(3)?,
                size: row.get(4)?,
                created_at: ms_to_dt(created_ms),
            })
        })
        .ok())
}

pub fn get_attachment_data(conn: &Connection, id: i64) -> Result<Vec<u8>> {
    let data: Vec<u8> = conn.query_row(
        "SELECT data FROM note_attachments WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    Ok(data)
}

pub fn delete_attachment(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM note_attachments WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn rename_attachment(conn: &Connection, id: i64, new_filename: &str) -> Result<()> {
    conn.execute(
        "UPDATE note_attachments SET filename = ?1 WHERE id = ?2",
        params![new_filename, id],
    )?;
    Ok(())
}

fn prepare_fts_query(query: &str) -> String {
    if query.contains('"')
        || query.contains('*')
        || query.contains('^')
        || query.contains("AND")
        || query.contains("OR")
        || query.contains("NOT")
    {
        return query.to_string();
    }
    query
        .split_whitespace()
        .map(|w| format!("\"{w}\"*"))
        .collect::<Vec<_>>()
        .join(" ")
}
