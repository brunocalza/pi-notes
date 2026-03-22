use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::collection::CollectionId;
use crate::domain::tag::Tag;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(transparent)]
pub struct NoteId(pub String);

impl NoteId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for NoteId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: NoteId,
    pub rowid: i64,
    pub title: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub in_inbox: bool,
    pub trashed: bool,
    pub linked_note_id: Option<NoteId>,
    pub image_path: Option<String>,
    pub tags: Vec<Tag>,
    pub collection_id: Option<CollectionId>,
}

impl Note {
    /// Create a brand-new note (not yet persisted).
    /// `rowid` is 0 — the DB assigns the real rowid on insert.
    pub fn create(title: String, content: String, tags: Vec<Tag>) -> Self {
        let now = Utc::now();
        Self {
            id: NoteId(Uuid::now_v7().to_string()),
            rowid: 0,
            title,
            content,
            created_at: now,
            updated_at: now,
            in_inbox: true,
            trashed: false,
            linked_note_id: None,
            image_path: None,
            tags,
            collection_id: None,
        }
    }

    /// Apply a content/tags edit. Updates `updated_at` only when title or
    /// content actually changes. Returns `true` if anything changed.
    pub fn apply_edit(&mut self, title: String, content: String, mut tags: Vec<Tag>) -> bool {
        let title_changed = self.title != title;
        let content_changed = self.content != content;

        tags.sort();
        let mut cur = self.tags.clone();
        cur.sort();
        let tags_changed = cur != tags;

        if !title_changed && !content_changed && !tags_changed {
            return false;
        }
        if title_changed || content_changed {
            self.title = title;
            self.content = content;
            self.updated_at = Utc::now();
        }
        if tags_changed {
            self.tags = tags;
        }
        true
    }
}
