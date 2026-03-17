use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub in_inbox: bool,
    pub trashed: bool,
    pub linked_note_id: Option<i64>,
    pub image_path: Option<String>,
    pub tags: Vec<String>,
}
