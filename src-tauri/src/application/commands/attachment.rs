use crate::domain::{attachment::AttachmentId, note::NoteId};

pub struct AddAttachment {
    pub note_id: NoteId,
    pub filename: String,
    pub mime_type: String,
    pub data: Vec<u8>,
}

pub struct RenameAttachment {
    pub id: AttachmentId,
    pub filename: String,
}
