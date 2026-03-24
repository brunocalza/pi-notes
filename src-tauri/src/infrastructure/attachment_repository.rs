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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::ports::attachment_repository::AttachmentRepository;
    use crate::application::ports::note_reader::NoteReader;
    use crate::application::ports::note_repository::NoteRepository;
    use crate::domain::note::Note;
    use crate::infrastructure::note_repository::{test_db, SqliteNoteRepository};
    use crate::infrastructure::sqlite_reader::SqliteNoteReader;

    fn setup() -> (
        SqliteAttachmentRepository,
        SqliteNoteRepository,
        SqliteNoteReader,
    ) {
        let db = test_db();
        (
            SqliteAttachmentRepository::new(Arc::clone(&db)),
            SqliteNoteRepository::new(Arc::clone(&db)),
            SqliteNoteReader::new(Arc::clone(&db)),
        )
    }

    fn make_meta(note_id: &crate::domain::note::NoteId, filename: &str) -> AttachmentMeta {
        use chrono::Utc;
        use uuid::Uuid;
        AttachmentMeta {
            id: AttachmentId(Uuid::now_v7().to_string()),
            note_id: note_id.clone(),
            filename: filename.into(),
            mime_type: "image/png".into(),
            size: 4,
            created_at: Utc::now(),
        }
    }

    #[test]
    fn save_and_retrieve_data() {
        let (att_repo, note_repo, reader) = setup();
        let note = Note::create("N".into(), "c".into(), vec![]);
        note_repo.save(&note).unwrap();
        let meta = make_meta(&note.id, "photo.png");
        att_repo.save(&meta, &[1, 2, 3, 4]).unwrap();
        let data = reader.get_attachment_data(meta.id.clone()).unwrap();
        assert_eq!(data, vec![1, 2, 3, 4]);
    }

    #[test]
    fn get_attachment_meta() {
        let (att_repo, note_repo, reader) = setup();
        let note = Note::create("N".into(), "c".into(), vec![]);
        note_repo.save(&note).unwrap();
        let meta = make_meta(&note.id, "doc.pdf");
        att_repo.save(&meta, &[0]).unwrap();
        let found = reader
            .get_attachment_meta(meta.id.clone())
            .unwrap()
            .unwrap();
        assert_eq!(found.filename, "doc.pdf");
        assert_eq!(found.mime_type, "image/png");
    }

    #[test]
    fn get_attachments_for_note() {
        let (att_repo, note_repo, reader) = setup();
        let note = Note::create("N".into(), "c".into(), vec![]);
        note_repo.save(&note).unwrap();
        let m1 = make_meta(&note.id, "a.png");
        let m2 = make_meta(&note.id, "b.png");
        att_repo.save(&m1, &[1]).unwrap();
        att_repo.save(&m2, &[2]).unwrap();
        let list = reader.get_attachments(note.id.clone()).unwrap();
        assert_eq!(list.len(), 2);
    }

    #[test]
    fn update_meta_changes_filename() {
        let (att_repo, note_repo, reader) = setup();
        let note = Note::create("N".into(), "c".into(), vec![]);
        note_repo.save(&note).unwrap();
        let mut meta = make_meta(&note.id, "original.png");
        att_repo.save(&meta, &[1]).unwrap();
        meta.filename = "renamed.png".into();
        att_repo.update_meta(&meta).unwrap();
        let found = reader
            .get_attachment_meta(meta.id.clone())
            .unwrap()
            .unwrap();
        assert_eq!(found.filename, "renamed.png");
    }

    #[test]
    fn delete_attachment() {
        let (att_repo, note_repo, reader) = setup();
        let note = Note::create("N".into(), "c".into(), vec![]);
        note_repo.save(&note).unwrap();
        let meta = make_meta(&note.id, "remove.png");
        att_repo.save(&meta, &[1]).unwrap();
        att_repo.delete(&meta.id).unwrap();
        assert!(reader
            .get_attachment_meta(meta.id.clone())
            .unwrap()
            .is_none());
    }
}
