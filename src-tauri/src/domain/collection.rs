use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(transparent)]
pub struct CollectionId(pub String);

impl CollectionId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for CollectionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: CollectionId,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub note_count: i64,
}

impl Collection {
    pub fn create(name: String) -> Self {
        let now = Utc::now();
        Self {
            id: CollectionId(Uuid::now_v7().to_string()),
            name,
            created_at: now,
            updated_at: now,
            note_count: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_sets_defaults() {
        let c = Collection::create("Books".into());
        assert!(!c.id.as_str().is_empty());
        assert_eq!(c.name, "Books");
        assert_eq!(c.note_count, 0);
        assert_eq!(c.created_at, c.updated_at);
    }

    #[test]
    fn collection_id_display() {
        let c = Collection::create("X".into());
        assert_eq!(c.id.to_string(), c.id.as_str());
    }

    #[test]
    fn two_collections_have_distinct_ids() {
        let a = Collection::create("A".into());
        let b = Collection::create("B".into());
        assert_ne!(a.id, b.id);
    }
}
