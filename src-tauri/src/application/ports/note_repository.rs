use crate::domain::{
    error::DomainError,
    note::{Note, NoteId},
};

pub trait NoteRepository: Send + Sync {
    fn save(&self, note: &Note) -> Result<(), DomainError>;
    fn delete(&self, id: &NoteId) -> Result<(), DomainError>;
    fn empty_trash(&self) -> Result<(), DomainError>;

    fn trash(&self, id: &NoteId) -> Result<(), DomainError>;
    fn restore(&self, id: &NoteId) -> Result<(), DomainError>;
    fn accept(&self, id: &NoteId) -> Result<(), DomainError>;
    fn move_to_inbox(&self, id: &NoteId) -> Result<(), DomainError>;
    fn set_image(&self, id: &NoteId, path: &str) -> Result<(), DomainError>;
}
