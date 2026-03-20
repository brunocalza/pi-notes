use anyhow::Result;
use rusqlite::{params, Connection, Transaction};
use std::sync::{Arc, Mutex};

use crate::application::ports::note_repository::NoteRepository;
use crate::domain::{
    date::extract_dates,
    error::DomainError,
    note::{Note, NoteId},
};

pub struct SqliteNoteRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteNoteRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }

    fn save_note(tx: &Transaction, note: &Note) -> Result<()> {
        tx.execute(
            "INSERT INTO notes (id, title, content, created_at, updated_at, in_inbox,
                                linked_note_id, image_path, trashed, back_of_mind, snoozed_until)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, NULL)
             ON CONFLICT(id) DO UPDATE SET
                 title          = excluded.title,
                 content        = excluded.content,
                 updated_at     = excluded.updated_at,
                 in_inbox       = excluded.in_inbox,
                 linked_note_id = excluded.linked_note_id,
                 image_path     = excluded.image_path,
                 trashed        = excluded.trashed",
            params![
                note.id.as_str(),
                note.title,
                note.content,
                note.created_at.timestamp_millis(),
                note.updated_at.timestamp_millis(),
                note.in_inbox as i32,
                note.linked_note_id.as_ref().map(NoteId::as_str),
                note.image_path,
                note.trashed as i32,
            ],
        )?;
        Ok(())
    }

    fn replace_tags(tx: &Transaction, note: &Note) -> Result<()> {
        tx.execute(
            "DELETE FROM note_tags WHERE note_id = ?1",
            params![note.id.as_str()],
        )?;
        for tag in &note.tags {
            tx.execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?1, ?2)",
                params![note.id.as_str(), tag.as_str()],
            )?;
        }
        Ok(())
    }

    fn replace_dates(tx: &Transaction, note: &Note) -> Result<()> {
        tx.execute(
            "DELETE FROM note_dates WHERE note_id = ?1",
            params![note.id.as_str()],
        )?;
        for date in extract_dates(&note.content) {
            tx.execute(
                "INSERT OR IGNORE INTO note_dates (note_id, date) VALUES (?1, ?2)",
                params![note.id.as_str(), date],
            )?;
        }
        Ok(())
    }
}

fn map_err(e: impl std::fmt::Display) -> DomainError {
    DomainError::StorageError(e.to_string())
}

impl NoteRepository for SqliteNoteRepository {
    fn save(&self, note: &Note) -> Result<(), DomainError> {
        let mut conn = self.conn.lock().map_err(map_err)?;
        let tx = conn.transaction().map_err(map_err)?;
        Self::save_note(&tx, note).map_err(map_err)?;
        Self::replace_tags(&tx, note).map_err(map_err)?;
        Self::replace_dates(&tx, note).map_err(map_err)?;
        tx.commit().map_err(map_err)?;
        Ok(())
    }

    fn delete(&self, id: &NoteId) -> Result<(), DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        conn.execute("DELETE FROM notes WHERE id = ?1", params![id.as_str()])
            .map_err(map_err)?;
        Ok(())
    }

    fn empty_trash(&self) -> Result<(), DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        conn.execute("DELETE FROM notes WHERE trashed = 1", [])
            .map_err(map_err)?;
        Ok(())
    }

    fn trash(&self, id: &NoteId) -> Result<(), DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        conn.execute(
            "UPDATE notes SET trashed = 1 WHERE id = ?1",
            params![id.as_str()],
        )
        .map_err(map_err)?;
        Ok(())
    }

    fn restore(&self, id: &NoteId) -> Result<(), DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        conn.execute(
            "UPDATE notes SET trashed = 0 WHERE id = ?1",
            params![id.as_str()],
        )
        .map_err(map_err)?;
        Ok(())
    }

    fn accept(&self, id: &NoteId) -> Result<(), DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        conn.execute(
            "UPDATE notes SET in_inbox = 0 WHERE id = ?1",
            params![id.as_str()],
        )
        .map_err(map_err)?;
        Ok(())
    }

    fn move_to_inbox(&self, id: &NoteId) -> Result<(), DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        conn.execute(
            "UPDATE notes SET in_inbox = 1, trashed = 0 WHERE id = ?1",
            params![id.as_str()],
        )
        .map_err(map_err)?;
        Ok(())
    }

    fn set_image(&self, id: &NoteId, path: &str) -> Result<(), DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        conn.execute(
            "UPDATE notes SET image_path = ?1 WHERE id = ?2",
            params![path, id.as_str()],
        )
        .map_err(map_err)?;
        Ok(())
    }
}
