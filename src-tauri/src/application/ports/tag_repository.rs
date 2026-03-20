use crate::domain::error::DomainError;

pub trait TagRepository: Send + Sync {
    fn rename(&self, old_tag: &str, new_tag: &str) -> Result<(), DomainError>;
    fn delete(&self, tag: &str) -> Result<(), DomainError>;
}
