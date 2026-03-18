//! Tag normalization for pi-notes.

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
