use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(transparent)]
pub struct Tag(String);

impl Tag {
    pub fn parse(raw: &str) -> Option<Self> {
        let s = raw.trim().trim_start_matches('#').to_lowercase();
        if s.is_empty() {
            None
        } else {
            Some(Tag(s))
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for Tag {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}
