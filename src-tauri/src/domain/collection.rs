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
