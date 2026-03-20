use rusqlite::{params, Connection, Transaction};
use std::sync::{Arc, Mutex};

use crate::application::ports::tag_repository::TagRepository;
use crate::domain::error::DomainError;

pub struct SqliteTagRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteTagRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    fn rename_tag(tx: &Transaction, old_tag: &str, new_tag: &str) -> anyhow::Result<()> {
        // Remove rows that would become duplicates after the rename
        tx.execute(
            "DELETE FROM note_tags WHERE tag = ?1
             AND note_id IN (SELECT note_id FROM note_tags WHERE tag = ?2)",
            params![old_tag, new_tag],
        )?;
        tx.execute(
            "UPDATE note_tags SET tag = ?1 WHERE tag = ?2",
            params![new_tag, old_tag],
        )?;
        Ok(())
    }
}

fn map_err(e: impl std::fmt::Display) -> DomainError {
    DomainError::StorageError(e.to_string())
}

impl TagRepository for SqliteTagRepository {
    fn rename(&self, old_tag: &str, new_tag: &str) -> Result<(), DomainError> {
        let mut conn = self.conn.lock().map_err(map_err)?;
        let tx = conn.transaction().map_err(map_err)?;
        Self::rename_tag(&tx, old_tag, new_tag).map_err(map_err)?;
        tx.commit().map_err(map_err)?;
        Ok(())
    }

    fn delete(&self, tag: &str) -> Result<(), DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        conn.execute("DELETE FROM note_tags WHERE tag = ?1", params![tag])
            .map_err(map_err)?;
        Ok(())
    }
}
