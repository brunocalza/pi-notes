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

#[cfg(test)]
pub(crate) fn test_db() -> Arc<Mutex<Connection>> {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
    crate::infrastructure::schema::apply_schema(&conn).unwrap();
    Arc::new(Mutex::new(conn))
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

    fn rename_wikilinks(&self, old_title: &str, new_title: &str) -> Result<(), DomainError> {
        if old_title.is_empty() || old_title == new_title {
            return Ok(());
        }
        let old_link = format!("[[{old_title}]]");
        let new_link = format!("[[{new_title}]]");
        let conn = self.conn.lock().map_err(map_err)?;
        conn.execute(
            "UPDATE notes SET content = REPLACE(content, ?1, ?2) WHERE instr(content, ?1) > 0",
            params![old_link, new_link],
        )
        .map_err(map_err)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::ports::note_reader::NoteReader;
    use crate::application::ports::note_repository::NoteRepository;
    use crate::domain::{note::Note, tag::Tag};
    use crate::infrastructure::sqlite_reader::SqliteNoteReader;

    fn repo() -> (SqliteNoteRepository, SqliteNoteReader) {
        let db = test_db();
        (
            SqliteNoteRepository::new(Arc::clone(&db)),
            SqliteNoteReader::new(db),
        )
    }

    fn note(title: &str) -> Note {
        Note::create(title.into(), "content".into(), vec![])
    }

    #[test]
    fn save_and_get() {
        let (repo, reader) = repo();
        let n = note("Hello");
        repo.save(&n).unwrap();
        let found = reader.get_note(n.id.clone()).unwrap().unwrap();
        assert_eq!(found.title, "Hello");
        assert!(found.in_inbox);
        assert!(!found.trashed);
    }

    #[test]
    fn save_updates_existing() {
        let (repo, reader) = repo();
        let mut n = note("Original");
        repo.save(&n).unwrap();
        n.apply_edit("Updated".into(), "new content".into(), vec![]);
        repo.save(&n).unwrap();
        let found = reader.get_note(n.id.clone()).unwrap().unwrap();
        assert_eq!(found.title, "Updated");
    }

    #[test]
    fn save_persists_tags() {
        let (repo, reader) = repo();
        let tags = vec![Tag::parse("rust").unwrap(), Tag::parse("dev").unwrap()];
        let n = Note::create("Tagged".into(), "c".into(), tags);
        repo.save(&n).unwrap();
        let found = reader.get_note(n.id.clone()).unwrap().unwrap();
        let mut tag_strs: Vec<&str> = found.tags.iter().map(Tag::as_str).collect();
        tag_strs.sort();
        assert_eq!(tag_strs, vec!["dev", "rust"]);
    }

    #[test]
    fn save_replaces_tags_on_update() {
        let (repo, reader) = repo();
        let mut n = Note::create("T".into(), "c".into(), vec![Tag::parse("old").unwrap()]);
        repo.save(&n).unwrap();
        n.apply_edit("T".into(), "c".into(), vec![Tag::parse("new").unwrap()]);
        repo.save(&n).unwrap();
        let found = reader.get_note(n.id.clone()).unwrap().unwrap();
        let strs: Vec<&str> = found.tags.iter().map(Tag::as_str).collect();
        assert_eq!(strs, vec!["new"]);
    }

    #[test]
    fn delete_removes_note() {
        let (repo, reader) = repo();
        let n = note("Delete me");
        repo.save(&n).unwrap();
        repo.delete(&n.id).unwrap();
        assert!(reader.get_note(n.id.clone()).unwrap().is_none());
    }

    #[test]
    fn trash_and_restore() {
        let (repo, reader) = repo();
        let n = note("Trash me");
        repo.save(&n).unwrap();
        repo.trash(&n.id).unwrap();
        let trashed = reader.get_note(n.id.clone()).unwrap().unwrap();
        assert!(trashed.trashed);
        repo.restore(&n.id).unwrap();
        let restored = reader.get_note(n.id.clone()).unwrap().unwrap();
        assert!(!restored.trashed);
    }

    #[test]
    fn accept_clears_inbox_flag() {
        let (repo, reader) = repo();
        let n = note("Accept me");
        repo.save(&n).unwrap();
        assert!(reader.get_note(n.id.clone()).unwrap().unwrap().in_inbox);
        repo.accept(&n.id).unwrap();
        assert!(!reader.get_note(n.id.clone()).unwrap().unwrap().in_inbox);
    }

    #[test]
    fn move_to_inbox_sets_flag_and_untrashes() {
        let (repo, reader) = repo();
        let n = note("Move me");
        repo.save(&n).unwrap();
        repo.trash(&n.id).unwrap();
        repo.accept(&n.id).unwrap();
        repo.move_to_inbox(&n.id).unwrap();
        let found = reader.get_note(n.id.clone()).unwrap().unwrap();
        assert!(found.in_inbox);
        assert!(!found.trashed);
    }

    #[test]
    fn empty_trash_removes_trashed_notes() {
        let (repo, reader) = repo();
        let a = note("Keep");
        let b = note("Trash me");
        repo.save(&a).unwrap();
        repo.save(&b).unwrap();
        repo.trash(&b.id).unwrap();
        repo.empty_trash().unwrap();
        assert!(reader.get_note(a.id.clone()).unwrap().is_some());
        assert!(reader.get_note(b.id.clone()).unwrap().is_none());
    }

    #[test]
    fn rename_wikilinks_updates_content() {
        let (repo, reader) = repo();
        let target = Note::create("Old Title".into(), "target content".into(), vec![]);
        let linker = Note::create("Linker".into(), "see [[Old Title]] here".into(), vec![]);
        repo.save(&target).unwrap();
        repo.save(&linker).unwrap();
        repo.rename_wikilinks("Old Title", "New Title").unwrap();
        let found = reader.get_note(linker.id.clone()).unwrap().unwrap();
        assert_eq!(found.content, "see [[New Title]] here");
    }

    #[test]
    fn rename_wikilinks_noop_when_titles_equal() {
        let (repo, reader) = repo();
        let n = Note::create("N".into(), "see [[Foo]] here".into(), vec![]);
        repo.save(&n).unwrap();
        repo.rename_wikilinks("Foo", "Foo").unwrap();
        let found = reader.get_note(n.id.clone()).unwrap().unwrap();
        assert_eq!(found.content, "see [[Foo]] here");
    }

    #[test]
    fn set_image_stores_path() {
        let (repo, reader) = repo();
        let n = note("Img");
        repo.save(&n).unwrap();
        repo.set_image(&n.id, "/tmp/photo.png").unwrap();
        let found = reader.get_note(n.id.clone()).unwrap().unwrap();
        assert_eq!(found.image_path.as_deref(), Some("/tmp/photo.png"));
    }

    #[test]
    fn save_extracts_dates_from_content() {
        let db = test_db();
        let repo = SqliteNoteRepository::new(Arc::clone(&db));
        let reader = SqliteNoteReader::new(Arc::clone(&db));
        let n = Note::create(
            "D".into(),
            "event on 2024-01-20 and 2024-07-04".into(),
            vec![],
        );
        repo.save(&n).unwrap();
        repo.accept(&n.id).unwrap();
        use crate::application::ports::note_reader::NoteReader;
        use crate::application::queries::note::GetNotesByDate;
        let results = reader
            .get_notes_by_date(GetNotesByDate {
                date: "2024-01-20".into(),
            })
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, n.id);
    }
}
