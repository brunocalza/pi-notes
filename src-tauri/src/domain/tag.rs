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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_basic() {
        let t = Tag::parse("rust").unwrap();
        assert_eq!(t.as_str(), "rust");
    }

    #[test]
    fn parse_strips_hash() {
        let t = Tag::parse("#rust").unwrap();
        assert_eq!(t.as_str(), "rust");
    }

    #[test]
    fn parse_trims_whitespace() {
        let t = Tag::parse("  rust  ").unwrap();
        assert_eq!(t.as_str(), "rust");
    }

    #[test]
    fn parse_lowercases() {
        let t = Tag::parse("Rust").unwrap();
        assert_eq!(t.as_str(), "rust");
    }

    #[test]
    fn parse_empty_returns_none() {
        assert!(Tag::parse("").is_none());
    }

    #[test]
    fn parse_only_hash_returns_none() {
        assert!(Tag::parse("#").is_none());
    }

    #[test]
    fn parse_only_whitespace_returns_none() {
        assert!(Tag::parse("   ").is_none());
    }

    #[test]
    fn display() {
        let t = Tag::parse("dev").unwrap();
        assert_eq!(t.to_string(), "dev");
    }

    #[test]
    fn ordering() {
        let a = Tag::parse("aaa").unwrap();
        let b = Tag::parse("bbb").unwrap();
        assert!(a < b);
    }

    #[test]
    fn equality() {
        let a = Tag::parse("rust").unwrap();
        let b = Tag::parse("#rust").unwrap();
        assert_eq!(a, b);
    }
}
