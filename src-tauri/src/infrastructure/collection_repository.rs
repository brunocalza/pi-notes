use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use std::sync::{Arc, Mutex};

use crate::application::ports::{
    collection_reader::CollectionReader, collection_repository::CollectionRepository,
};
use crate::domain::{
    collection::{Collection, CollectionId},
    error::DomainError,
    note::NoteId,
};

pub struct SqliteCollectionRepository {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteCollectionRepository {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

fn map_err(e: impl std::fmt::Display) -> DomainError {
    DomainError::StorageError(e.to_string())
}

fn map_write_err(name: &str, e: rusqlite::Error) -> DomainError {
    if let rusqlite::Error::SqliteFailure(ref err, _) = e {
        if err.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE {
            return DomainError::DuplicateName(name.to_string());
        }
    }
    DomainError::StorageError(e.to_string())
}

fn ms_to_dt(ms: i64) -> DateTime<Utc> {
    DateTime::from_timestamp_millis(ms).unwrap_or_else(Utc::now)
}

impl CollectionRepository for SqliteCollectionRepository {
    fn save(&self, collection: &Collection) -> Result<(), DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        conn.execute(
            "INSERT INTO collections (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![
                collection.id.as_str(),
                collection.name,
                collection.created_at.timestamp_millis(),
                collection.updated_at.timestamp_millis(),
            ],
        )
        .map_err(|e| map_write_err(&collection.name, e))?;
        Ok(())
    }

    fn delete(&self, id: &CollectionId) -> Result<(), DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        conn.execute(
            "DELETE FROM collections WHERE id = ?1",
            params![id.as_str()],
        )
        .map_err(map_err)?;
        Ok(())
    }

    fn rename(&self, id: &CollectionId, new_name: &str) -> Result<(), DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE collections SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_name, now, id.as_str()],
        )
        .map_err(|e| map_write_err(new_name, e))?;
        Ok(())
    }

    fn set_note_collection(
        &self,
        note_id: &NoteId,
        collection_id: Option<&CollectionId>,
    ) -> Result<(), DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        match collection_id {
            Some(cid) => conn.execute(
                "UPDATE notes SET collection_id = ?1 WHERE id = ?2",
                params![cid.as_str(), note_id.as_str()],
            ),
            None => conn.execute(
                "UPDATE notes SET collection_id = NULL WHERE id = ?1",
                params![note_id.as_str()],
            ),
        }
        .map_err(map_err)?;
        Ok(())
    }
}

impl CollectionReader for SqliteCollectionRepository {
    fn list_collections(&self) -> Result<Vec<Collection>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let mut stmt = conn
            .prepare(
                "SELECT c.id, c.name, c.created_at, c.updated_at,
                        COUNT(n.id) as note_count
                 FROM collections c
                 LEFT JOIN notes n ON n.collection_id = c.id AND n.trashed = 0
                 GROUP BY c.id
                 ORDER BY c.name ASC",
            )
            .map_err(map_err)?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            })
            .map_err(map_err)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(map_err)?;
        let collections = rows
            .into_iter()
            .map(
                |(id, name, created_ms, updated_ms, note_count)| Collection {
                    id: CollectionId(id),
                    name,
                    created_at: ms_to_dt(created_ms),
                    updated_at: ms_to_dt(updated_ms),
                    note_count,
                },
            )
            .collect();
        Ok(collections)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::ports::collection_reader::CollectionReader;
    use crate::application::ports::collection_repository::CollectionRepository;
    use crate::application::ports::note_repository::NoteRepository;
    use crate::domain::collection::Collection;
    use crate::domain::note::Note;
    use crate::infrastructure::note_repository::{test_db, SqliteNoteRepository};

    fn setup() -> (SqliteCollectionRepository, SqliteNoteRepository) {
        let db = test_db();
        (
            SqliteCollectionRepository::new(Arc::clone(&db)),
            SqliteNoteRepository::new(Arc::clone(&db)),
        )
    }

    #[test]
    fn save_and_list() {
        let (repo, _) = setup();
        let c = Collection::create("Books".into());
        repo.save(&c).unwrap();
        let list = repo.list_collections().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "Books");
    }

    #[test]
    fn duplicate_name_returns_error() {
        let (repo, _) = setup();
        let c1 = Collection::create("Books".into());
        let c2 = Collection::create("Books".into());
        repo.save(&c1).unwrap();
        let err = repo.save(&c2).unwrap_err();
        assert!(matches!(
            err,
            crate::domain::error::DomainError::DuplicateName(_)
        ));
    }

    #[test]
    fn delete_collection() {
        let (repo, _) = setup();
        let c = Collection::create("Temp".into());
        repo.save(&c).unwrap();
        repo.delete(&c.id).unwrap();
        let list = repo.list_collections().unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn rename_collection() {
        let (repo, _) = setup();
        let c = Collection::create("Old Name".into());
        repo.save(&c).unwrap();
        repo.rename(&c.id, "New Name").unwrap();
        let list = repo.list_collections().unwrap();
        assert_eq!(list[0].name, "New Name");
    }

    #[test]
    fn rename_to_duplicate_returns_error() {
        let (repo, _) = setup();
        let c1 = Collection::create("Alpha".into());
        let c2 = Collection::create("Beta".into());
        repo.save(&c1).unwrap();
        repo.save(&c2).unwrap();
        let err = repo.rename(&c2.id, "Alpha").unwrap_err();
        assert!(matches!(
            err,
            crate::domain::error::DomainError::DuplicateName(_)
        ));
    }

    #[test]
    fn set_note_collection_assigns_and_clears() {
        let (col_repo, note_repo) = setup();
        let c = Collection::create("Archive".into());
        col_repo.save(&c).unwrap();
        let note = Note::create("N".into(), "c".into(), vec![]);
        note_repo.save(&note).unwrap();
        col_repo.set_note_collection(&note.id, Some(&c.id)).unwrap();
        // verify via list_collections note_count (counts non-trashed notes regardless of inbox)
        let list = col_repo.list_collections().unwrap();
        assert_eq!(list[0].note_count, 1);
        col_repo.set_note_collection(&note.id, None).unwrap();
    }

    #[test]
    fn list_collections_sorted_by_name() {
        let (repo, _) = setup();
        repo.save(&Collection::create("Zebra".into())).unwrap();
        repo.save(&Collection::create("Alpha".into())).unwrap();
        repo.save(&Collection::create("Middle".into())).unwrap();
        let list = repo.list_collections().unwrap();
        let names: Vec<&str> = list.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, vec!["Alpha", "Middle", "Zebra"]);
    }
}
