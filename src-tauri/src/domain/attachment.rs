use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::domain::note::NoteId;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(transparent)]
pub struct AttachmentId(pub String);

impl AttachmentId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for AttachmentId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentMeta {
    pub id: AttachmentId,
    pub note_id: NoteId,
    pub filename: String,
    pub mime_type: String,
    pub size: i64,
    pub created_at: DateTime<Utc>,
}
