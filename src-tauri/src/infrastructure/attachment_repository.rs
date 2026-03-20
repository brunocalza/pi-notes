use rusqlite::{params, Connection};
use std::sync::{Arc, Mutex};

use crate::application::ports::attachment_repository::AttachmentRepository;
use crate::domain::{
    attachment::{AttachmentId, AttachmentMeta},
    error::DomainError,
};

pub struct SqliteAttachmentRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteAttachmentRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

fn map_err(e: impl std::fmt::Display) -> DomainError {
    DomainError::StorageError(e.to_string())
}

impl AttachmentRepository for SqliteAttachmentRepository {
    fn save(&self, meta: &AttachmentMeta, data: &[u8]) -> Result<(), DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        conn.execute(
            "INSERT INTO note_attachments (id, note_id, filename, mime_type, data, size, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                meta.id.as_str(),
                meta.note_id.as_str(),
                meta.filename,
                meta.mime_type,
                data,
                meta.size,
                meta.created_at.timestamp_millis(),
            ],
        )
        .map_err(map_err)?;
        Ok(())
    }

    fn update_meta(&self, meta: &AttachmentMeta) -> Result<(), DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        conn.execute(
            "UPDATE note_attachments SET filename = ?1, mime_type = ?2 WHERE id = ?3",
            params![meta.filename, meta.mime_type, meta.id.as_str()],
        )
        .map_err(map_err)?;
        Ok(())
    }

    fn delete(&self, id: &AttachmentId) -> Result<(), DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        conn.execute(
            "DELETE FROM note_attachments WHERE id = ?1",
            params![id.as_str()],
        )
        .map_err(map_err)?;
        Ok(())
    }
}
