//! Tag normalization for pi-notes.

/// Normalises a raw user input string into tag form:
/// - trims whitespace
/// - lowercases
/// - strips `#` prefix
pub fn normalize_tag(raw: &str) -> String {
    raw.trim().trim_start_matches('#').to_lowercase()
}
