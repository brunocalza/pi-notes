use std::sync::Arc;

use chrono::Utc;
use uuid::Uuid;

use crate::application::{
    commands::{
        attachment::{AddAttachment, RenameAttachment},
        collection::{CreateCollection, DeleteCollection, RenameCollection, SetNoteCollection},
        note::{CreateNote, SetNoteImage, UpdateNote},
        tag::{DeleteTag, RenameTag},
    },
    ports::{
        attachment_repository::AttachmentRepository, collection_reader::CollectionReader,
        collection_repository::CollectionRepository, note_reader::NoteReader,
        note_repository::NoteRepository, tag_repository::TagRepository,
    },
    queries::note::{
        GetNotesByCollection, GetNotesByDate, GetNotesByTag, ListInbox, ListNotes, ListTrash,
        SearchNotes,
    },
};
use crate::domain::{
    attachment::{AttachmentId, AttachmentMeta},
    collection::{Collection, CollectionId},
    error::DomainError,
    note::{Note, NoteId},
    tag::Tag,
};

pub struct AppService {
    notes: Arc<dyn NoteRepository>,
    tags: Arc<dyn TagRepository>,
    attachments: Arc<dyn AttachmentRepository>,
    reader: Arc<dyn NoteReader>,
    collections: Arc<dyn CollectionRepository>,
    collection_reader: Arc<dyn CollectionReader>,
}

impl AppService {
    pub fn new(
        notes: Arc<dyn NoteRepository>,
        tags: Arc<dyn TagRepository>,
        attachments: Arc<dyn AttachmentRepository>,
        reader: Arc<dyn NoteReader>,
        collections: Arc<dyn CollectionRepository>,
        collection_reader: Arc<dyn CollectionReader>,
    ) -> Self {
        Self {
            notes,
            tags,
            attachments,
            reader,
            collections,
            collection_reader,
        }
    }

    // -------------------------------------------------------------------------
    // Note commands
    // -------------------------------------------------------------------------

    pub fn create_note(&self, cmd: CreateNote) -> Result<NoteId, DomainError> {
        let tags = cmd.tags.iter().filter_map(|t| Tag::parse(t)).collect();
        let note = Note::create(cmd.title, cmd.content, tags);
        let id = note.id.clone();
        self.notes.save(&note)?;
        Ok(id)
    }

    pub fn update_note(&self, cmd: UpdateNote) -> Result<(), DomainError> {
        let mut note = self
            .reader
            .get_note(cmd.id.clone())?
            .ok_or_else(|| DomainError::NotFound(cmd.id.to_string()))?;
        let old_title = note.title.clone();
        let tags = cmd.tags.iter().filter_map(|t| Tag::parse(t)).collect();
        if note.apply_edit(cmd.title, cmd.content, tags) {
            if note.title != old_title {
                self.notes.rename_wikilinks(&old_title, &note.title)?;
            }
            self.notes.save(&note)?;
        }
        Ok(())
    }

    pub fn trash_note(&self, id: NoteId) -> Result<(), DomainError> {
        self.notes.trash(&id)
    }

    pub fn restore_note(&self, id: NoteId) -> Result<(), DomainError> {
        self.notes.restore(&id)
    }

    pub fn accept_note(&self, id: NoteId) -> Result<(), DomainError> {
        self.notes.accept(&id)
    }

    pub fn move_to_inbox(&self, id: NoteId) -> Result<(), DomainError> {
        self.notes.move_to_inbox(&id)
    }

    pub fn delete_note(&self, id: NoteId) -> Result<(), DomainError> {
        self.notes.delete(&id)
    }

    pub fn empty_trash(&self) -> Result<(), DomainError> {
        self.notes.empty_trash()
    }

    pub fn set_note_image(&self, cmd: SetNoteImage) -> Result<(), DomainError> {
        self.notes.set_image(&cmd.id, &cmd.path)
    }

    // -------------------------------------------------------------------------
    // Tag commands
    // -------------------------------------------------------------------------

    pub fn rename_tag(&self, cmd: RenameTag) -> Result<(), DomainError> {
        let Some(new_tag) = Tag::parse(&cmd.new_tag) else {
            return Ok(());
        };
        if new_tag.as_str() == cmd.old_tag.as_str() {
            return Ok(());
        }
        self.tags.rename(&cmd.old_tag, new_tag.as_str())
    }

    pub fn delete_tag(&self, cmd: DeleteTag) -> Result<(), DomainError> {
        self.tags.delete(&cmd.tag)
    }

    // -------------------------------------------------------------------------
    // Collection commands
    // -------------------------------------------------------------------------

    pub fn create_collection(&self, cmd: CreateCollection) -> Result<CollectionId, DomainError> {
        let name = cmd.name.trim().to_string();
        if name.is_empty() {
            return Err(DomainError::ValidationError(
                "Collection name cannot be empty".to_string(),
            ));
        }
        if name.len() > 50 {
            return Err(DomainError::ValidationError(
                "Collection name must be 50 characters or fewer".to_string(),
            ));
        }
        let collection = Collection::create(name);
        let id = collection.id.clone();
        self.collections.save(&collection)?;
        Ok(id)
    }

    pub fn rename_collection(&self, cmd: RenameCollection) -> Result<(), DomainError> {
        let name = cmd.new_name.trim().to_string();
        if name.is_empty() {
            return Err(DomainError::ValidationError(
                "Collection name cannot be empty".to_string(),
            ));
        }
        if name.len() > 50 {
            return Err(DomainError::ValidationError(
                "Collection name must be 50 characters or fewer".to_string(),
            ));
        }
        self.collections.rename(&cmd.id, &name)
    }

    pub fn delete_collection(&self, cmd: DeleteCollection) -> Result<(), DomainError> {
        self.collections.delete(&cmd.id)
    }

    pub fn set_note_collection(&self, cmd: SetNoteCollection) -> Result<(), DomainError> {
        self.collections
            .set_note_collection(&cmd.note_id, cmd.collection_id.as_ref())
    }

    pub fn list_collections(&self) -> Result<Vec<Collection>, DomainError> {
        self.collection_reader.list_collections()
    }

    pub fn get_notes_by_collection(
        &self,
        q: GetNotesByCollection,
    ) -> Result<Vec<Note>, DomainError> {
        self.reader.get_notes_by_collection(q)
    }

    // -------------------------------------------------------------------------
    // Attachment commands
    // -------------------------------------------------------------------------

    pub fn add_attachment(&self, cmd: AddAttachment) -> Result<AttachmentId, DomainError> {
        let id = AttachmentId(Uuid::now_v7().to_string());
        let meta = AttachmentMeta {
            id: id.clone(),
            note_id: cmd.note_id,
            filename: cmd.filename,
            mime_type: cmd.mime_type,
            size: cmd.data.len() as i64,
            created_at: Utc::now(),
        };
        self.attachments.save(&meta, &cmd.data)?;
        Ok(id)
    }

    pub fn rename_attachment(&self, cmd: RenameAttachment) -> Result<(), DomainError> {
        let mut meta = self
            .reader
            .get_attachment_meta(cmd.id.clone())?
            .ok_or_else(|| DomainError::NotFound(cmd.id.to_string()))?;
        meta.filename = cmd.filename;
        self.attachments.update_meta(&meta)
    }

    pub fn delete_attachment(&self, id: AttachmentId) -> Result<(), DomainError> {
        self.attachments.delete(&id)
    }

    // -------------------------------------------------------------------------
    // Queries (delegate to reader)
    // -------------------------------------------------------------------------

    pub fn get_note(&self, id: NoteId) -> Result<Option<Note>, DomainError> {
        self.reader.get_note(id)
    }

    pub fn get_note_by_title(&self, title: &str) -> Result<Option<Note>, DomainError> {
        self.reader.get_note_by_title(title)
    }

    pub fn list_notes(&self, q: ListNotes) -> Result<Vec<Note>, DomainError> {
        self.reader.list_notes(q)
    }

    pub fn list_inbox(&self, q: ListInbox) -> Result<Vec<Note>, DomainError> {
        self.reader.list_inbox(q)
    }

    pub fn list_trash(&self, q: ListTrash) -> Result<Vec<Note>, DomainError> {
        self.reader.list_trash(q)
    }

    pub fn search_notes(&self, q: SearchNotes) -> Result<Vec<Note>, DomainError> {
        self.reader.search_notes(q)
    }

    pub fn get_notes_by_tag(&self, q: GetNotesByTag) -> Result<Vec<Note>, DomainError> {
        self.reader.get_notes_by_tag(q)
    }

    pub fn get_notes_by_date(&self, q: GetNotesByDate) -> Result<Vec<Note>, DomainError> {
        self.reader.get_notes_by_date(q)
    }

    pub fn get_backlinks(&self, id: NoteId) -> Result<Vec<Note>, DomainError> {
        self.reader.get_backlinks(id)
    }

    pub fn get_recent_notes(&self) -> Result<Vec<Note>, DomainError> {
        self.reader.get_recent_notes()
    }

    pub fn get_all_tags(&self) -> Result<Vec<(String, i64)>, DomainError> {
        self.reader.get_all_tags()
    }

    pub fn get_all_note_titles(&self) -> Result<Vec<String>, DomainError> {
        self.reader.get_all_note_titles()
    }

    pub fn get_days_with_notes_in_month(&self, year_month: &str) -> Result<Vec<u32>, DomainError> {
        self.reader.get_days_with_notes_in_month(year_month)
    }

    pub fn get_attachments(&self, note_id: NoteId) -> Result<Vec<AttachmentMeta>, DomainError> {
        self.reader.get_attachments(note_id)
    }

    pub fn get_attachment_data(&self, id: AttachmentId) -> Result<Vec<u8>, DomainError> {
        self.reader.get_attachment_data(id)
    }

    pub fn get_attachment_meta(
        &self,
        id: AttachmentId,
    ) -> Result<Option<AttachmentMeta>, DomainError> {
        self.reader.get_attachment_meta(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::commands::{
        attachment::{AddAttachment, RenameAttachment},
        collection::{CreateCollection, DeleteCollection, RenameCollection, SetNoteCollection},
        note::{CreateNote, SetNoteImage, UpdateNote},
        tag::{DeleteTag, RenameTag},
    };
    use crate::application::queries::note::{
        GetNotesByDate, GetNotesByTag, ListInbox, ListNotes, ListTrash, SearchNotes,
    };
    use crate::infrastructure::{
        attachment_repository::SqliteAttachmentRepository,
        collection_repository::SqliteCollectionRepository,
        note_repository::{test_db, SqliteNoteRepository},
        sqlite_reader::SqliteNoteReader,
        tag_repository::SqliteTagRepository,
    };

    fn make_service() -> AppService {
        let db = test_db();
        let col = Arc::new(SqliteCollectionRepository::new(Arc::clone(&db)));
        AppService::new(
            Arc::new(SqliteNoteRepository::new(Arc::clone(&db))),
            Arc::new(SqliteTagRepository::new(Arc::clone(&db))),
            Arc::new(SqliteAttachmentRepository::new(Arc::clone(&db))),
            Arc::new(SqliteNoteReader::new(Arc::clone(&db))),
            Arc::clone(&col)
                as Arc<dyn crate::application::ports::collection_repository::CollectionRepository>,
            col as Arc<dyn crate::application::ports::collection_reader::CollectionReader>,
        )
    }

    fn create(svc: &AppService, title: &str, content: &str, tags: Vec<&str>) -> NoteId {
        svc.create_note(CreateNote {
            title: title.into(),
            content: content.into(),
            tags: tags.into_iter().map(String::from).collect(),
        })
        .unwrap()
    }

    // ── Note commands ────────────────────────────────────────────────────────

    #[test]
    fn create_and_get_note() {
        let svc = make_service();
        let id = create(&svc, "Hello", "world", vec![]);
        let note = svc.get_note(id.clone()).unwrap().unwrap();
        assert_eq!(note.title, "Hello");
        assert!(note.in_inbox);
    }

    #[test]
    fn update_note_changes_content() {
        let svc = make_service();
        let id = create(&svc, "Old", "old content", vec![]);
        svc.update_note(UpdateNote {
            id: id.clone(),
            title: "New".into(),
            content: "new content".into(),
            tags: vec![],
        })
        .unwrap();
        let note = svc.get_note(id).unwrap().unwrap();
        assert_eq!(note.title, "New");
        assert_eq!(note.content, "new content");
    }

    #[test]
    fn update_note_renames_wikilinks_in_other_notes() {
        let svc = make_service();
        let target_id = create(&svc, "Old Title", "c", vec![]);
        let linker_id = create(
            &svc,
            "Linker",
            "see [Old Title](<wikilink:Old Title>) here",
            vec![],
        );
        svc.update_note(UpdateNote {
            id: target_id.clone(),
            title: "New Title".into(),
            content: "c".into(),
            tags: vec![],
        })
        .unwrap();
        let linker = svc.get_note(linker_id).unwrap().unwrap();
        assert!(linker.content.contains("[New Title](<wikilink:New Title>)"));
        assert!(!linker.content.contains("wikilink:Old Title"));
    }

    #[test]
    fn update_note_not_found_returns_error() {
        let svc = make_service();
        let err = svc
            .update_note(UpdateNote {
                id: NoteId("nonexistent".into()),
                title: "T".into(),
                content: "C".into(),
                tags: vec![],
            })
            .unwrap_err();
        assert!(matches!(err, DomainError::NotFound(_)));
    }

    #[test]
    fn accept_note_clears_inbox() {
        let svc = make_service();
        let id = create(&svc, "T", "C", vec![]);
        svc.accept_note(id.clone()).unwrap();
        let note = svc.get_note(id).unwrap().unwrap();
        assert!(!note.in_inbox);
    }

    #[test]
    fn trash_and_restore_note() {
        let svc = make_service();
        let id = create(&svc, "T", "C", vec![]);
        svc.accept_note(id.clone()).unwrap();
        svc.trash_note(id.clone()).unwrap();
        let trashed = svc.get_note(id.clone()).unwrap().unwrap();
        assert!(trashed.trashed);
        svc.restore_note(id.clone()).unwrap();
        let restored = svc.get_note(id).unwrap().unwrap();
        assert!(!restored.trashed);
    }

    #[test]
    fn delete_note() {
        let svc = make_service();
        let id = create(&svc, "T", "C", vec![]);
        svc.delete_note(id.clone()).unwrap();
        assert!(svc.get_note(id).unwrap().is_none());
    }

    #[test]
    fn empty_trash() {
        let svc = make_service();
        let id = create(&svc, "T", "C", vec![]);
        svc.accept_note(id.clone()).unwrap();
        svc.trash_note(id.clone()).unwrap();
        svc.empty_trash().unwrap();
        let notes = svc
            .list_trash(ListTrash {
                limit: 100,
                cursor: None,
            })
            .unwrap();
        assert!(notes.is_empty());
    }

    #[test]
    fn move_to_inbox() {
        let svc = make_service();
        let id = create(&svc, "T", "C", vec![]);
        svc.accept_note(id.clone()).unwrap();
        svc.move_to_inbox(id.clone()).unwrap();
        let note = svc.get_note(id).unwrap().unwrap();
        assert!(note.in_inbox);
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    #[test]
    fn list_notes_and_inbox() {
        let svc = make_service();
        let id1 = create(&svc, "Inbox Note", "c", vec![]);
        let id2 = create(&svc, "Accepted", "c", vec![]);
        svc.accept_note(id2.clone()).unwrap();
        let inbox = svc
            .list_inbox(ListInbox {
                limit: 100,
                cursor: None,
            })
            .unwrap();
        let notes = svc
            .list_notes(ListNotes {
                limit: 100,
                cursor: None,
            })
            .unwrap();
        assert!(inbox.iter().any(|n| n.id == id1));
        assert!(notes.iter().any(|n| n.id == id2));
    }

    #[test]
    fn search_notes() {
        let svc = make_service();
        let id = create(&svc, "Rust Programming", "fearless concurrency", vec![]);
        svc.accept_note(id.clone()).unwrap();
        let results = svc
            .search_notes(SearchNotes {
                query: "fearless".into(),
                limit: 10,
                cursor: None,
            })
            .unwrap();
        assert!(results.iter().any(|n| n.id == id));
    }

    #[test]
    fn get_note_by_title() {
        let svc = make_service();
        let id = create(&svc, "Unique Title", "c", vec![]);
        let found = svc.get_note_by_title("unique title").unwrap().unwrap();
        assert_eq!(found.id, id);
    }

    #[test]
    fn get_notes_by_tag() {
        let svc = make_service();
        let id = create(&svc, "Tagged", "c", vec!["rust"]);
        svc.accept_note(id.clone()).unwrap();
        let results = svc
            .get_notes_by_tag(GetNotesByTag {
                tag: "rust".into(),
                limit: 10,
                cursor: None,
            })
            .unwrap();
        assert!(results.iter().any(|n| n.id == id));
    }

    #[test]
    fn get_notes_by_date() {
        let svc = make_service();
        let id = create(&svc, "D", "event on 2025-11-05", vec![]);
        svc.accept_note(id.clone()).unwrap();
        let results = svc
            .get_notes_by_date(GetNotesByDate {
                date: "2025-11-05".into(),
            })
            .unwrap();
        assert!(results.iter().any(|n| n.id == id));
    }

    #[test]
    fn get_all_tags() {
        let svc = make_service();
        let id = create(&svc, "T", "c", vec!["mytag"]);
        svc.accept_note(id).unwrap();
        let tags = svc.get_all_tags().unwrap();
        assert!(tags.iter().any(|(t, _)| t == "mytag"));
    }

    #[test]
    fn get_all_note_titles() {
        let svc = make_service();
        create(&svc, "Special Title", "c", vec![]);
        let titles = svc.get_all_note_titles().unwrap();
        assert!(titles.contains(&"Special Title".to_string()));
    }

    #[test]
    fn get_days_with_notes_in_month() {
        let svc = make_service();
        let id = create(&svc, "D", "on 2025-08-12", vec![]);
        svc.accept_note(id).unwrap();
        let days = svc.get_days_with_notes_in_month("2025-08").unwrap();
        assert!(days.contains(&12));
    }

    #[test]
    fn get_recent_notes_max_five() {
        let svc = make_service();
        for i in 0..8 {
            let id = create(&svc, &format!("Note {i}"), "c", vec![]);
            svc.accept_note(id).unwrap();
        }
        let recent = svc.get_recent_notes().unwrap();
        assert!(recent.len() <= 5);
    }

    #[test]
    fn get_backlinks() {
        let svc = make_service();
        let target_id = create(&svc, "Target", "c", vec![]);
        svc.accept_note(target_id.clone()).unwrap();
        let linker_id = create(&svc, "Linker", "see [Target](<wikilink:Target>)", vec![]);
        svc.accept_note(linker_id.clone()).unwrap();
        let links = svc.get_backlinks(target_id).unwrap();
        assert!(links.iter().any(|n| n.id == linker_id));
    }

    // ── Tag commands ──────────────────────────────────────────────────────────

    #[test]
    fn rename_tag() {
        let svc = make_service();
        let id = create(&svc, "T", "c", vec!["old"]);
        svc.accept_note(id.clone()).unwrap();
        svc.rename_tag(RenameTag {
            old_tag: "old".into(),
            new_tag: "new".into(),
        })
        .unwrap();
        let tags = svc.get_all_tags().unwrap();
        assert!(!tags.iter().any(|(t, _)| t == "old"));
        assert!(tags.iter().any(|(t, _)| t == "new"));
    }

    #[test]
    fn rename_tag_to_same_is_noop() {
        let svc = make_service();
        let id = create(&svc, "T", "c", vec!["same"]);
        svc.accept_note(id).unwrap();
        svc.rename_tag(RenameTag {
            old_tag: "same".into(),
            new_tag: "same".into(),
        })
        .unwrap();
        let tags = svc.get_all_tags().unwrap();
        assert!(tags.iter().any(|(t, _)| t == "same"));
    }

    #[test]
    fn rename_tag_invalid_new_is_noop() {
        let svc = make_service();
        // renaming to empty tag should be a no-op (Tag::parse returns None)
        svc.rename_tag(RenameTag {
            old_tag: "x".into(),
            new_tag: "".into(),
        })
        .unwrap();
    }

    #[test]
    fn delete_tag() {
        let svc = make_service();
        let id = create(&svc, "T", "c", vec!["removeme"]);
        svc.accept_note(id).unwrap();
        svc.delete_tag(DeleteTag {
            tag: "removeme".into(),
        })
        .unwrap();
        let tags = svc.get_all_tags().unwrap();
        assert!(!tags.iter().any(|(t, _)| t == "removeme"));
    }

    // ── Collection commands ───────────────────────────────────────────────────

    #[test]
    fn create_collection_and_list() {
        let svc = make_service();
        let id = svc
            .create_collection(CreateCollection {
                name: "Research".into(),
            })
            .unwrap();
        let list = svc.list_collections().unwrap();
        assert!(list.iter().any(|c| c.id == id));
    }

    #[test]
    fn create_collection_empty_name_errors() {
        let svc = make_service();
        let err = svc
            .create_collection(CreateCollection { name: "  ".into() })
            .unwrap_err();
        assert!(matches!(err, DomainError::ValidationError(_)));
    }

    #[test]
    fn create_collection_too_long_errors() {
        let svc = make_service();
        let err = svc
            .create_collection(CreateCollection {
                name: "a".repeat(51),
            })
            .unwrap_err();
        assert!(matches!(err, DomainError::ValidationError(_)));
    }

    #[test]
    fn rename_collection() {
        let svc = make_service();
        let id = svc
            .create_collection(CreateCollection { name: "Old".into() })
            .unwrap();
        svc.rename_collection(RenameCollection {
            id: id.clone(),
            new_name: "New".into(),
        })
        .unwrap();
        let list = svc.list_collections().unwrap();
        let c = list.iter().find(|c| c.id == id).unwrap();
        assert_eq!(c.name, "New");
    }

    #[test]
    fn rename_collection_empty_name_errors() {
        let svc = make_service();
        let id = svc
            .create_collection(CreateCollection { name: "X".into() })
            .unwrap();
        let err = svc
            .rename_collection(RenameCollection {
                id,
                new_name: "".into(),
            })
            .unwrap_err();
        assert!(matches!(err, DomainError::ValidationError(_)));
    }

    #[test]
    fn delete_collection() {
        let svc = make_service();
        let id = svc
            .create_collection(CreateCollection {
                name: "Temp".into(),
            })
            .unwrap();
        svc.delete_collection(DeleteCollection { id }).unwrap();
        let list = svc.list_collections().unwrap();
        assert!(list.is_empty());
    }

    #[test]
    fn set_note_collection() {
        let svc = make_service();
        let cid = svc
            .create_collection(CreateCollection {
                name: "Archive".into(),
            })
            .unwrap();
        let nid = create(&svc, "N", "c", vec![]);
        svc.set_note_collection(SetNoteCollection {
            note_id: nid.clone(),
            collection_id: Some(cid.clone()),
        })
        .unwrap();
        svc.set_note_collection(SetNoteCollection {
            note_id: nid,
            collection_id: None,
        })
        .unwrap();
    }

    #[test]
    fn get_notes_by_collection() {
        let svc = make_service();
        let cid = svc
            .create_collection(CreateCollection { name: "Col".into() })
            .unwrap();
        let nid = create(&svc, "N", "c", vec![]);
        svc.set_note_collection(SetNoteCollection {
            note_id: nid.clone(),
            collection_id: Some(cid.clone()),
        })
        .unwrap();
        let results = svc
            .get_notes_by_collection(crate::application::queries::note::GetNotesByCollection {
                collection_id: cid.to_string(),
                limit: 10,
                cursor: None,
            })
            .unwrap();
        assert!(results.iter().any(|n| n.id == nid));
    }

    // ── Attachment commands ───────────────────────────────────────────────────

    #[test]
    fn add_and_get_attachment() {
        let svc = make_service();
        let nid = create(&svc, "N", "c", vec![]);
        let aid = svc
            .add_attachment(AddAttachment {
                note_id: nid.clone(),
                filename: "photo.png".into(),
                mime_type: "image/png".into(),
                data: vec![1, 2, 3],
            })
            .unwrap();
        let data = svc.get_attachment_data(aid.clone()).unwrap();
        assert_eq!(data, vec![1, 2, 3]);
        let meta = svc.get_attachment_meta(aid.clone()).unwrap().unwrap();
        assert_eq!(meta.filename, "photo.png");
        let list = svc.get_attachments(nid).unwrap();
        assert_eq!(list.len(), 1);
    }

    #[test]
    fn rename_attachment() {
        let svc = make_service();
        let nid = create(&svc, "N", "c", vec![]);
        let aid = svc
            .add_attachment(AddAttachment {
                note_id: nid,
                filename: "original.png".into(),
                mime_type: "image/png".into(),
                data: vec![0],
            })
            .unwrap();
        svc.rename_attachment(RenameAttachment {
            id: aid.clone(),
            filename: "renamed.png".into(),
        })
        .unwrap();
        let meta = svc.get_attachment_meta(aid).unwrap().unwrap();
        assert_eq!(meta.filename, "renamed.png");
    }

    #[test]
    fn rename_attachment_not_found_errors() {
        let svc = make_service();
        let err = svc
            .rename_attachment(RenameAttachment {
                id: AttachmentId("nope".into()),
                filename: "x.png".into(),
            })
            .unwrap_err();
        assert!(matches!(err, DomainError::NotFound(_)));
    }

    #[test]
    fn set_note_image() {
        let svc = make_service();
        let nid = create(&svc, "Img", "c", vec![]);
        svc.set_note_image(SetNoteImage {
            id: nid.clone(),
            path: "/tmp/photo.png".into(),
        })
        .unwrap();
        let found = svc.get_note(nid).unwrap().unwrap();
        assert_eq!(found.image_path.as_deref(), Some("/tmp/photo.png"));
    }

    #[test]
    fn rename_collection_too_long_errors() {
        let svc = make_service();
        let id = svc
            .create_collection(CreateCollection {
                name: "Short".into(),
            })
            .unwrap();
        let err = svc
            .rename_collection(RenameCollection {
                id,
                new_name: "A".repeat(51),
            })
            .unwrap_err();
        assert!(matches!(err, DomainError::ValidationError(_)));
    }

    #[test]
    fn delete_attachment() {
        let svc = make_service();
        let nid = create(&svc, "N", "c", vec![]);
        let aid = svc
            .add_attachment(AddAttachment {
                note_id: nid,
                filename: "f.png".into(),
                mime_type: "image/png".into(),
                data: vec![0],
            })
            .unwrap();
        svc.delete_attachment(aid.clone()).unwrap();
        assert!(svc.get_attachment_meta(aid).unwrap().is_none());
    }
}
