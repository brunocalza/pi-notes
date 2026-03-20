use crate::application::queries::note::{
    GetNotesByDate, GetNotesByTag, ListInbox, ListNotes, ListTrash, SearchNotes,
};
use crate::domain::{
    attachment::{AttachmentId, AttachmentMeta},
    error::DomainError,
    note::{Note, NoteId},
};

pub trait NoteReader: Send + Sync {
    fn get_note(&self, id: NoteId) -> Result<Option<Note>, DomainError>;
    fn get_note_by_title(&self, title: &str) -> Result<Option<Note>, DomainError>;
    fn list_notes(&self, q: ListNotes) -> Result<Vec<Note>, DomainError>;
    fn list_inbox(&self, q: ListInbox) -> Result<Vec<Note>, DomainError>;
    fn list_trash(&self, q: ListTrash) -> Result<Vec<Note>, DomainError>;
    fn search_notes(&self, q: SearchNotes) -> Result<Vec<Note>, DomainError>;
    fn get_notes_by_tag(&self, q: GetNotesByTag) -> Result<Vec<Note>, DomainError>;
    fn get_notes_by_date(&self, q: GetNotesByDate) -> Result<Vec<Note>, DomainError>;
    fn get_backlinks(&self, id: NoteId) -> Result<Vec<Note>, DomainError>;
    fn get_recent_notes(&self) -> Result<Vec<Note>, DomainError>;
    fn get_all_tags(&self) -> Result<Vec<(String, i64)>, DomainError>;
    fn get_all_note_titles(&self) -> Result<Vec<String>, DomainError>;
    fn get_days_with_notes_in_month(&self, year_month: &str) -> Result<Vec<u32>, DomainError>;
    fn get_attachments(&self, note_id: NoteId) -> Result<Vec<AttachmentMeta>, DomainError>;
    fn get_attachment_data(&self, id: AttachmentId) -> Result<Vec<u8>, DomainError>;
    fn get_attachment_meta(&self, id: AttachmentId) -> Result<Option<AttachmentMeta>, DomainError>;
}
