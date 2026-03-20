use crate::domain::{
    attachment::{AttachmentId, AttachmentMeta},
    error::DomainError,
};

pub trait AttachmentRepository: Send + Sync {
    fn save(&self, meta: &AttachmentMeta, data: &[u8]) -> Result<(), DomainError>;
    fn update_meta(&self, meta: &AttachmentMeta) -> Result<(), DomainError>;
    fn delete(&self, id: &AttachmentId) -> Result<(), DomainError>;
}
