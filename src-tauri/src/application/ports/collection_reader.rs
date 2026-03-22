use crate::domain::collection::Collection;
use crate::domain::error::DomainError;

pub trait CollectionReader: Send + Sync {
    fn list_collections(&self) -> Result<Vec<Collection>, DomainError>;
}
