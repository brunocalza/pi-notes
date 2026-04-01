use anyhow::Result;
use rusqlite::{params, Connection};
use std::path::PathBuf;

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
    run_migrations(&conn)?;
    Ok(conn)
}

// ---------------------------------------------------------------------------
// Migration system
// ---------------------------------------------------------------------------

struct Migration {
    version: i64,
    description: &'static str,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[Migration {
    version: 1,
    description: "initial_schema",
    sql: include_str!("../../migrations/0001_initial_schema.sql"),
}];

pub(crate) fn run_migrations(conn: &Connection) -> Result<()> {
    bootstrap_from_legacy(conn)?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            version     INTEGER PRIMARY KEY,
            description TEXT    NOT NULL,
            applied_at  INTEGER NOT NULL
        )",
    )?;

    let applied: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT version FROM _migrations")?;
        let rows = stmt
            .query_map([], |row| row.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        rows
    };

    for m in MIGRATIONS {
        if applied.contains(&m.version) {
            continue;
        }
        conn.execute_batch(m.sql)?;
        conn.execute(
            "INSERT INTO _migrations (version, description, applied_at) VALUES (?1, ?2, ?3)",
            params![
                m.version,
                m.description,
                chrono::Utc::now().timestamp_millis()
            ],
        )?;
    }

    Ok(())
}

/// Detect databases created by the old PRAGMA user_version system and
/// bootstrap them into the new _migrations table.
fn bootstrap_from_legacy(conn: &Connection) -> Result<()> {
    let has_migrations_table: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_migrations'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|n| n > 0)
        .unwrap_or(false);

    if has_migrations_table {
        return Ok(());
    }

    let user_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    if user_version >= 5 {
        // Old system fully migrated — schema already matches migration 1.
        // Create tracking table and mark migration 1 as applied.
        conn.execute_batch(
            "CREATE TABLE _migrations (
                version     INTEGER PRIMARY KEY,
                description TEXT    NOT NULL,
                applied_at  INTEGER NOT NULL
            )",
        )?;
        conn.execute(
            "INSERT INTO _migrations (version, description, applied_at) VALUES (1, 'initial_schema', 0)",
            [],
        )?;
        conn.execute_batch("PRAGMA user_version = 0")?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_db_runs_all_migrations() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).unwrap();

        // Notes table exists
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='notes'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);

        // All migrations are recorded
        let version: i64 = conn
            .query_row("SELECT MAX(version) FROM _migrations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, MIGRATIONS.last().unwrap().version);
    }

    #[test]
    fn idempotent_rerun() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).unwrap();
        run_migrations(&conn).unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM _migrations", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, MIGRATIONS.len() as i64);
    }

    #[test]
    fn bootstrap_from_legacy_db() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();

        // Simulate an old database at user_version 5 with existing tables
        conn.execute_batch("PRAGMA user_version = 5").unwrap();
        conn.execute_batch(
            "CREATE TABLE notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                in_inbox INTEGER NOT NULL DEFAULT 1,
                linked_note_id TEXT,
                image_path TEXT,
                trashed INTEGER NOT NULL DEFAULT 0,
                back_of_mind INTEGER NOT NULL DEFAULT 0,
                snoozed_until INTEGER,
                collection_id TEXT
            )",
        )
        .unwrap();

        run_migrations(&conn).unwrap();

        // user_version reset to 0
        let uv: i32 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(uv, 0);

        // Migration 1 marked as applied (not re-run)
        let version: i64 = conn
            .query_row(
                "SELECT version FROM _migrations WHERE version = 1",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(version, 1);
    }

    #[test]
    fn note_links_table_created() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='note_links'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn fts_triggers_created() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        run_migrations(&conn).unwrap();

        let triggers: Vec<String> = {
            let mut stmt = conn
                .prepare("SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name")
                .unwrap();
            stmt.query_map([], |r| r.get(0))
                .unwrap()
                .collect::<rusqlite::Result<_>>()
                .unwrap()
        };
        assert_eq!(triggers, vec!["notes_ad", "notes_ai", "notes_au"]);
    }
}
