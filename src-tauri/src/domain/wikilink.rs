/// Extract all note IDs from wikilink patterns in content.
/// Handles both `(wikilink:UUID)` (current) and `(<wikilink:UUID>)` (legacy) formats.
/// Only returns values that look like valid UUIDs (36 chars with hyphens).
pub fn extract_wikilink_ids(content: &str) -> Vec<String> {
    let needle = "wikilink:";
    let mut ids = Vec::new();
    let mut rest = content;

    while let Some(start) = rest.find(needle) {
        rest = &rest[start + needle.len()..];
        let end = rest
            .find(')')
            .or_else(|| rest.find('>'))
            .unwrap_or(rest.len());
        let value = rest[..end].trim_end_matches('>');
        // UUID v7 is 36 chars with hyphens
        if value.len() == 36 && value.contains('-') {
            ids.push(value.to_string());
        }
        rest = &rest[end..];
    }
    ids
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic() {
        let content = "see [Foo](wikilink:019560a1-b1c2-7def-8abc-123456789012) here";
        let ids = extract_wikilink_ids(content);
        assert_eq!(ids, vec!["019560a1-b1c2-7def-8abc-123456789012"]);
    }

    #[test]
    fn legacy_angle_bracket_format() {
        let content = "see [Foo](<wikilink:019560a1-b1c2-7def-8abc-123456789012>) here";
        let ids = extract_wikilink_ids(content);
        assert_eq!(ids, vec!["019560a1-b1c2-7def-8abc-123456789012"]);
    }

    #[test]
    fn multiple() {
        let content = "[A](wikilink:019560a1-b1c2-7def-8abc-123456789012) and [B](wikilink:019560a1-b1c2-7def-8abc-999999999999)";
        let ids = extract_wikilink_ids(content);
        assert_eq!(
            ids,
            vec![
                "019560a1-b1c2-7def-8abc-123456789012",
                "019560a1-b1c2-7def-8abc-999999999999"
            ]
        );
    }

    #[test]
    fn skips_non_uuid_values() {
        let content = "see [Foo](wikilink:Foo) here";
        let ids = extract_wikilink_ids(content);
        assert!(ids.is_empty());
    }
}
