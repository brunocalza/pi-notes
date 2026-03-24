use std::fmt;

#[derive(Debug)]
pub enum DomainError {
    #[allow(dead_code)]
    NotFound(String),
    StorageError(String),
    ValidationError(String),
    DuplicateName(String),
}

impl fmt::Display for DomainError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DomainError::NotFound(id) => write!(f, "not found: {id}"),
            DomainError::StorageError(msg) => write!(f, "storage error: {msg}"),
            DomainError::ValidationError(msg) => write!(f, "{msg}"),
            DomainError::DuplicateName(name) => {
                write!(f, "A collection named \"{name}\" already exists")
            }
        }
    }
}

impl From<anyhow::Error> for DomainError {
    fn from(e: anyhow::Error) -> Self {
        DomainError::StorageError(e.to_string())
    }
}

impl From<rusqlite::Error> for DomainError {
    fn from(e: rusqlite::Error) -> Self {
        DomainError::StorageError(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_not_found() {
        let e = DomainError::NotFound("abc".into());
        assert_eq!(e.to_string(), "not found: abc");
    }

    #[test]
    fn display_storage_error() {
        let e = DomainError::StorageError("disk full".into());
        assert_eq!(e.to_string(), "storage error: disk full");
    }

    #[test]
    fn display_validation_error() {
        let e = DomainError::ValidationError("name required".into());
        assert_eq!(e.to_string(), "name required");
    }

    #[test]
    fn display_duplicate_name() {
        let e = DomainError::DuplicateName("Books".into());
        assert!(e.to_string().contains("Books"));
    }

    #[test]
    fn from_anyhow() {
        let e: DomainError = anyhow::anyhow!("oops").into();
        assert!(matches!(e, DomainError::StorageError(_)));
    }

    #[test]
    fn from_rusqlite() {
        let sqlite_err = rusqlite::Error::QueryReturnedNoRows;
        let e: DomainError = sqlite_err.into();
        assert!(matches!(e, DomainError::StorageError(_)));
    }
}
