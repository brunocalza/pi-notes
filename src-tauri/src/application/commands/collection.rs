use crate::domain::collection::CollectionId;
use crate::domain::note::NoteId;

pub struct CreateCollection {
    pub name: String,
}

pub struct RenameCollection {
    pub id: CollectionId,
    pub new_name: String,
}

pub struct DeleteCollection {
    pub id: CollectionId,
}

pub struct SetNoteCollection {
    pub note_id: NoteId,
    pub collection_id: Option<CollectionId>,
}
