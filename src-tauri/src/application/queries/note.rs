pub struct Cursor {
    pub ts: i64,
    pub rowid: i64,
}

pub struct ListNotes {
    pub limit: i64,
    pub cursor: Option<Cursor>,
}

pub struct ListInbox {
    pub limit: i64,
    pub cursor: Option<Cursor>,
}

pub struct ListTrash {
    pub limit: i64,
    pub cursor: Option<Cursor>,
}

pub struct SearchNotes {
    pub query: String,
    pub limit: i64,
    pub cursor: Option<Cursor>,
}

pub struct GetNotesByTag {
    pub tag: String,
    pub limit: i64,
    pub cursor: Option<Cursor>,
}

pub struct GetNotesByDate {
    pub date: String,
}

pub struct GetNotesByCollection {
    pub collection_id: String,
    pub limit: i64,
    pub cursor: Option<Cursor>,
}
