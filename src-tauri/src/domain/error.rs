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
