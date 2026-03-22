use crate::domain::collection::CollectionId;
use crate::domain::error::DomainError;
use crate::domain::note::NoteId;

pub trait CollectionRepository: Send + Sync {
    fn save(&self, collection: &crate::domain::collection::Collection) -> Result<(), DomainError>;
    fn delete(&self, id: &CollectionId) -> Result<(), DomainError>;
    fn rename(&self, id: &CollectionId, new_name: &str) -> Result<(), DomainError>;
    fn set_note_collection(
        &self,
        note_id: &NoteId,
        collection_id: Option<&CollectionId>,
    ) -> Result<(), DomainError>;
}
