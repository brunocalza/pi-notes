/// Tag validation and normalization for pi-notes.
///
/// Valid tag format (canonical regex):
/// `^(?=.{1,50}$)[a-z0-9]+(?:-[a-z0-9]+)*(?:/[a-z0-9]+(?:-[a-z0-9]+)*)*$`
///
/// Examples of valid tags: `rust`, `distributed-systems`, `language/rust`

// ── Public API ────────────────────────────────────────────────────────────────

/// Returns `true` if `tag` is already in canonical valid form (no normalization applied).
pub fn is_valid_tag(tag: &str) -> bool {
    if tag.is_empty() || tag.len() > 50 {
        return false;
    }
    if tag.starts_with('/') || tag.ends_with('/') {
        return false;
    }
    if tag.chars().any(|c| !matches!(c, 'a'..='z' | '0'..='9' | '-' | '/')) {
        return false;
    }
    if tag.contains("--") || tag.contains("//") {
        return false;
    }
    for segment in tag.split('/') {
        if segment.is_empty() {
            return false;
        }
        let first = segment.chars().next().unwrap();
        let last = segment.chars().next_back().unwrap();
        if first == '-' || last == '-' {
            return false;
        }
    }
    true
}

/// Normalises a raw user input string into tag form:
/// - trims whitespace
/// - lowercases
/// - converts internal whitespace runs to `-`
/// - collapses multiple consecutive hyphens into one
/// - strips `#` prefix
pub fn normalize_tag(raw: &str) -> String {
    let s = raw.trim().trim_start_matches('#').to_lowercase();
    let mut result = String::with_capacity(s.len());
    let mut prev_hyphen = false;
    let mut in_space = false;
    for ch in s.chars() {
        if ch.is_whitespace() {
            if !in_space {
                result.push('-');
                prev_hyphen = true;
            }
            in_space = true;
        } else if ch == '-' {
            if !prev_hyphen {
                result.push('-');
            }
            prev_hyphen = true;
            in_space = false;
        } else {
            result.push(ch);
            prev_hyphen = false;
            in_space = false;
        }
    }
    result
}
