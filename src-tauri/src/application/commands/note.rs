use crate::domain::note::NoteId;

pub struct CreateNote {
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
}

pub struct UpdateNote {
    pub id: NoteId,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
}

pub struct SetNoteImage {
    pub id: NoteId,
    pub path: String,
}
