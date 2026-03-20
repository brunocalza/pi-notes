use std::sync::Arc;

use chrono::Utc;
use uuid::Uuid;

use crate::application::{
    commands::{
        attachment::{AddAttachment, RenameAttachment},
        note::{CreateNote, SetNoteImage, UpdateNote},
        tag::{DeleteTag, RenameTag},
    },
    ports::{
        attachment_repository::AttachmentRepository, note_reader::NoteReader,
        note_repository::NoteRepository, tag_repository::TagRepository,
    },
    queries::note::{GetNotesByDate, GetNotesByTag, ListInbox, ListNotes, ListTrash, SearchNotes},
};
use crate::domain::{
    attachment::{AttachmentId, AttachmentMeta},
    error::DomainError,
    note::{Note, NoteId},
    tag::Tag,
};

pub struct AppService {
    notes: Arc<dyn NoteRepository>,
    tags: Arc<dyn TagRepository>,
    attachments: Arc<dyn AttachmentRepository>,
    reader: Arc<dyn NoteReader>,
}

impl AppService {
    pub fn new(
        notes: Arc<dyn NoteRepository>,
        tags: Arc<dyn TagRepository>,
        attachments: Arc<dyn AttachmentRepository>,
        reader: Arc<dyn NoteReader>,
    ) -> Self {
        Self {
            notes,
            tags,
            attachments,
            reader,
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
        let tags = cmd.tags.iter().filter_map(|t| Tag::parse(t)).collect();
        if note.apply_edit(cmd.title, cmd.content, tags) {
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
