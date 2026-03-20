use crate::domain::{attachment::AttachmentId, note::NoteId};

#[allow(dead_code)]
pub struct GetAttachments {
    pub note_id: NoteId,
}

#[allow(dead_code)]
pub struct GetAttachmentData {
    pub id: AttachmentId,
}

#[allow(dead_code)]
pub struct GetAttachmentMeta {
    pub id: AttachmentId,
}
