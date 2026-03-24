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

#[cfg(test)]
mod tests {
    use super::*;

    fn tag(s: &str) -> Tag {
        Tag::parse(s).unwrap()
    }

    #[test]
    fn create_sets_defaults() {
        let note = Note::create("Title".into(), "Content".into(), vec![]);
        assert!(!note.id.as_str().is_empty());
        assert_eq!(note.title, "Title");
        assert_eq!(note.content, "Content");
        assert_eq!(note.rowid, 0);
        assert!(note.in_inbox);
        assert!(!note.trashed);
        assert!(note.linked_note_id.is_none());
        assert!(note.image_path.is_none());
        assert!(note.collection_id.is_none());
        assert_eq!(note.created_at, note.updated_at);
    }

    #[test]
    fn create_with_tags() {
        let note = Note::create("T".into(), "C".into(), vec![tag("rust"), tag("dev")]);
        assert_eq!(note.tags.len(), 2);
    }

    #[test]
    fn note_id_display() {
        let note = Note::create("T".into(), "C".into(), vec![]);
        assert_eq!(note.id.to_string(), note.id.as_str());
    }

    #[test]
    fn apply_edit_no_change_returns_false() {
        let mut note = Note::create("Title".into(), "Content".into(), vec![tag("a")]);
        let original_updated_at = note.updated_at;
        let changed = note.apply_edit("Title".into(), "Content".into(), vec![tag("a")]);
        assert!(!changed);
        assert_eq!(note.updated_at, original_updated_at);
    }

    #[test]
    fn apply_edit_title_change_returns_true() {
        let mut note = Note::create("Old".into(), "Content".into(), vec![]);
        let changed = note.apply_edit("New".into(), "Content".into(), vec![]);
        assert!(changed);
        assert_eq!(note.title, "New");
    }

    #[test]
    fn apply_edit_content_change_bumps_updated_at() {
        let mut note = Note::create("T".into(), "Old".into(), vec![]);
        let before = note.updated_at;
        // Busy-wait for at least 1ms to ensure updated_at changes
        std::thread::sleep(std::time::Duration::from_millis(2));
        let changed = note.apply_edit("T".into(), "New".into(), vec![]);
        assert!(changed);
        assert!(note.updated_at >= before);
        assert_eq!(note.content, "New");
    }

    #[test]
    fn apply_edit_tags_only_does_not_bump_updated_at() {
        let mut note = Note::create("T".into(), "C".into(), vec![tag("a")]);
        let original_updated_at = note.updated_at;
        let changed = note.apply_edit("T".into(), "C".into(), vec![tag("b")]);
        assert!(changed);
        assert_eq!(note.updated_at, original_updated_at);
        assert_eq!(note.tags, vec![tag("b")]);
    }

    #[test]
    fn apply_edit_tags_reordered_no_change() {
        let mut note = Note::create("T".into(), "C".into(), vec![tag("b"), tag("a")]);
        let changed = note.apply_edit("T".into(), "C".into(), vec![tag("a"), tag("b")]);
        assert!(!changed);
    }
}
