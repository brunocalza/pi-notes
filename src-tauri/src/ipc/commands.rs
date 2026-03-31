use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use dirs;
use tauri::State;

use crate::application::{
    commands::{
        attachment::{AddAttachment, RenameAttachment},
        collection::{CreateCollection, DeleteCollection, RenameCollection, SetNoteCollection},
        note::{CreateNote, SetNoteImage, UpdateNote},
        tag::{DeleteTag, RenameTag},
    },
    queries::note::{
        Cursor, GetNotesByCollection, GetNotesByDate, GetNotesByTag, ListInbox, ListNotes,
        ListTrash, SearchNotes,
    },
};
use crate::domain::{
    attachment::{AttachmentId, AttachmentMeta},
    collection::{Collection, CollectionId},
    error::DomainError,
    note::{Note, NoteId},
};
use crate::infrastructure::schema;
use crate::ipc::state::AppState;

fn to_ipc_err(e: impl std::fmt::Display) -> String {
    eprintln!("[pi-notes error] {e}");
    "An internal error occurred".to_string()
}

fn to_user_err(e: DomainError) -> String {
    match e {
        DomainError::ValidationError(_) | DomainError::DuplicateName(_) => e.to_string(),
        _ => to_ipc_err(e),
    }
}

fn make_cursor(ts: Option<i64>, rowid: Option<i64>) -> Option<Cursor> {
    match (ts, rowid) {
        (Some(ts), Some(rowid)) => Some(Cursor { ts, rowid }),
        _ => None,
    }
}

fn clamp_limit(limit: i64) -> i64 {
    limit.clamp(1, 1000)
}

// ---------------------------------------------------------------------------
// Note queries
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_notes(state: State<AppState>) -> Result<Vec<Note>, String> {
    state
        .service
        .list_notes(ListNotes {
            limit: 500,
            cursor: None,
        })
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn list_notes_cursor(
    state: State<AppState>,
    limit: i64,
    cursor_ts: Option<i64>,
    cursor_rowid: Option<i64>,
) -> Result<Vec<Note>, String> {
    state
        .service
        .list_notes(ListNotes {
            limit: clamp_limit(limit),
            cursor: make_cursor(cursor_ts, cursor_rowid),
        })
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn get_inbox_cursor(
    state: State<AppState>,
    limit: i64,
    cursor_ts: Option<i64>,
    cursor_rowid: Option<i64>,
) -> Result<Vec<Note>, String> {
    state
        .service
        .list_inbox(ListInbox {
            limit: clamp_limit(limit),
            cursor: make_cursor(cursor_ts, cursor_rowid),
        })
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn get_trash_cursor(
    state: State<AppState>,
    limit: i64,
    cursor_ts: Option<i64>,
    cursor_rowid: Option<i64>,
) -> Result<Vec<Note>, String> {
    state
        .service
        .list_trash(ListTrash {
            limit: clamp_limit(limit),
            cursor: make_cursor(cursor_ts, cursor_rowid),
        })
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn get_notes_by_tag_cursor(
    state: State<AppState>,
    tag: String,
    limit: i64,
    cursor_ts: Option<i64>,
    cursor_rowid: Option<i64>,
) -> Result<Vec<Note>, String> {
    state
        .service
        .get_notes_by_tag(GetNotesByTag {
            tag,
            limit: clamp_limit(limit),
            cursor: make_cursor(cursor_ts, cursor_rowid),
        })
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn search_notes_cursor(
    state: State<AppState>,
    query: String,
    limit: i64,
    cursor_ts: Option<i64>,
    cursor_rowid: Option<i64>,
) -> Result<Vec<Note>, String> {
    state
        .service
        .search_notes(SearchNotes {
            query,
            limit: clamp_limit(limit),
            cursor: make_cursor(cursor_ts, cursor_rowid),
        })
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn get_note(state: State<AppState>, id: String) -> Result<Option<Note>, String> {
    state.service.get_note(NoteId(id)).map_err(to_ipc_err)
}

#[tauri::command]
pub fn get_note_by_title(state: State<AppState>, title: String) -> Result<Option<Note>, String> {
    state.service.get_note_by_title(&title).map_err(to_ipc_err)
}

#[tauri::command]
pub fn get_recent_notes(state: State<AppState>) -> Result<Vec<Note>, String> {
    state.service.get_recent_notes().map_err(to_ipc_err)
}

#[tauri::command]
pub fn get_backlinks(state: State<AppState>, id: String) -> Result<Vec<Note>, String> {
    state.service.get_backlinks(NoteId(id)).map_err(to_ipc_err)
}

#[tauri::command]
pub fn get_notes_by_date(state: State<AppState>, date: String) -> Result<Vec<Note>, String> {
    state
        .service
        .get_notes_by_date(GetNotesByDate { date })
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn get_days_with_notes_in_month(
    state: State<AppState>,
    year_month: String,
) -> Result<Vec<u32>, String> {
    state
        .service
        .get_days_with_notes_in_month(&year_month)
        .map_err(to_ipc_err)
}

// ---------------------------------------------------------------------------
// Deprecated list/search commands (kept for backward compat; delegate to cursored versions)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_inbox(state: State<AppState>) -> Result<Vec<Note>, String> {
    state
        .service
        .list_inbox(ListInbox {
            limit: 500,
            cursor: None,
        })
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn get_trash(state: State<AppState>) -> Result<Vec<Note>, String> {
    state
        .service
        .list_trash(ListTrash {
            limit: 500,
            cursor: None,
        })
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn search_notes(state: State<AppState>, query: String) -> Result<Vec<Note>, String> {
    state
        .service
        .search_notes(SearchNotes {
            query,
            limit: 500,
            cursor: None,
        })
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn get_notes_by_tag(state: State<AppState>, tag: String) -> Result<Vec<Note>, String> {
    state
        .service
        .get_notes_by_tag(GetNotesByTag {
            tag,
            limit: 500,
            cursor: None,
        })
        .map_err(to_ipc_err)
}

// ---------------------------------------------------------------------------
// Note commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn insert_note(
    state: State<AppState>,
    title: String,
    content: String,
    tags: Vec<String>,
) -> Result<String, String> {
    let id = state
        .service
        .create_note(CreateNote {
            title,
            content,
            tags,
        })
        .map_err(to_ipc_err)?;
    Ok(id.to_string())
}

#[tauri::command]
pub fn update_note(
    state: State<AppState>,
    id: String,
    title: String,
    content: String,
    tags: Vec<String>,
) -> Result<(), String> {
    state
        .service
        .update_note(UpdateNote {
            id: NoteId(id),
            title,
            content,
            tags,
        })
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn delete_note(state: State<AppState>, id: String) -> Result<(), String> {
    state.service.delete_note(NoteId(id)).map_err(to_ipc_err)
}

#[tauri::command]
pub fn accept_note(state: State<AppState>, id: String) -> Result<(), String> {
    state.service.accept_note(NoteId(id)).map_err(to_ipc_err)
}

#[tauri::command]
pub fn trash_note(state: State<AppState>, id: String) -> Result<(), String> {
    state.service.trash_note(NoteId(id)).map_err(to_ipc_err)
}

#[tauri::command]
pub fn restore_note(state: State<AppState>, id: String) -> Result<(), String> {
    state.service.restore_note(NoteId(id)).map_err(to_ipc_err)
}

#[tauri::command]
pub fn move_to_inbox(state: State<AppState>, id: String) -> Result<(), String> {
    state.service.move_to_inbox(NoteId(id)).map_err(to_ipc_err)
}

#[tauri::command]
pub fn empty_trash(state: State<AppState>) -> Result<(), String> {
    state.service.empty_trash().map_err(to_ipc_err)
}

#[tauri::command]
pub fn set_note_image(state: State<AppState>, id: String, path: String) -> Result<(), String> {
    let data_dir =
        dirs::data_local_dir().ok_or_else(|| "Cannot resolve data directory".to_string())?;
    let canonical = std::fs::canonicalize(&path).map_err(|_| "Invalid image path".to_string())?;
    if !canonical.starts_with(&data_dir) {
        return Err("Image path outside allowed directory".to_string());
    }
    state
        .service
        .set_note_image(SetNoteImage {
            id: NoteId(id),
            path,
        })
        .map_err(to_ipc_err)
}

// ---------------------------------------------------------------------------
// Tag commands & queries
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_all_tags(state: State<AppState>) -> Result<Vec<(String, i64)>, String> {
    state.service.get_all_tags().map_err(to_ipc_err)
}

#[tauri::command]
pub fn get_all_note_titles(state: State<AppState>) -> Result<Vec<String>, String> {
    state.service.get_all_note_titles().map_err(to_ipc_err)
}

#[tauri::command]
pub fn rename_tag(state: State<AppState>, old_tag: String, new_tag: String) -> Result<(), String> {
    state
        .service
        .rename_tag(RenameTag { old_tag, new_tag })
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn delete_tag(state: State<AppState>, tag: String) -> Result<(), String> {
    state
        .service
        .delete_tag(DeleteTag { tag })
        .map_err(to_ipc_err)
}

// ---------------------------------------------------------------------------
// Attachment commands & queries
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn add_attachment(
    state: State<AppState>,
    note_id: String,
    filename: String,
    mime_type: String,
    data: Vec<u8>,
) -> Result<String, String> {
    if filename.contains('/') || filename.contains('\\') || filename.contains("..") {
        return Err("Invalid filename".to_string());
    }
    let id = state
        .service
        .add_attachment(AddAttachment {
            note_id: NoteId(note_id),
            filename,
            mime_type,
            data,
        })
        .map_err(to_ipc_err)?;
    Ok(id.to_string())
}

#[tauri::command]
pub fn get_attachments(
    state: State<AppState>,
    note_id: String,
) -> Result<Vec<AttachmentMeta>, String> {
    state
        .service
        .get_attachments(NoteId(note_id))
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn get_attachment_data(state: State<AppState>, id: String) -> Result<String, String> {
    let data = state
        .service
        .get_attachment_data(AttachmentId(id))
        .map_err(to_ipc_err)?;
    Ok(BASE64.encode(&data))
}

#[tauri::command]
pub fn delete_attachment(state: State<AppState>, id: String) -> Result<(), String> {
    state
        .service
        .delete_attachment(AttachmentId(id))
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn rename_attachment(
    state: State<AppState>,
    id: String,
    filename: String,
) -> Result<(), String> {
    state
        .service
        .rename_attachment(RenameAttachment {
            id: AttachmentId(id),
            filename,
        })
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn open_attachment(state: State<AppState>, id: String) -> Result<(), String> {
    let (filename, data) = {
        let meta = state
            .service
            .get_attachment_meta(AttachmentId(id.clone()))
            .map_err(to_ipc_err)?
            .ok_or_else(|| "Attachment not found".to_string())?;
        let data = state
            .service
            .get_attachment_data(AttachmentId(id))
            .map_err(to_ipc_err)?;
        (meta.filename, data)
    };
    let safe_name = std::path::Path::new(&filename)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid attachment filename".to_string())?;
    let path = std::env::temp_dir().join(safe_name);
    std::fs::write(&path, &data).map_err(to_ipc_err)?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(to_ipc_err)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(to_ipc_err)?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &path.to_string_lossy()])
        .spawn()
        .map_err(to_ipc_err)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Collection commands & queries
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_collections(state: State<AppState>) -> Result<Vec<Collection>, String> {
    state.service.list_collections().map_err(to_ipc_err)
}

#[tauri::command]
pub fn create_collection(state: State<AppState>, name: String) -> Result<String, String> {
    let id = state
        .service
        .create_collection(CreateCollection { name })
        .map_err(to_user_err)?;
    Ok(id.to_string())
}

#[tauri::command]
pub fn rename_collection(
    state: State<AppState>,
    id: String,
    new_name: String,
) -> Result<(), String> {
    state
        .service
        .rename_collection(RenameCollection {
            id: CollectionId(id),
            new_name,
        })
        .map_err(to_user_err)
}

#[tauri::command]
pub fn delete_collection(state: State<AppState>, id: String) -> Result<(), String> {
    state
        .service
        .delete_collection(DeleteCollection {
            id: CollectionId(id),
        })
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn set_note_collection(
    state: State<AppState>,
    note_id: String,
    collection_id: Option<String>,
) -> Result<(), String> {
    state
        .service
        .set_note_collection(SetNoteCollection {
            note_id: NoteId(note_id),
            collection_id: collection_id.map(CollectionId),
        })
        .map_err(to_ipc_err)
}

#[tauri::command]
pub fn get_notes_by_collection_cursor(
    state: State<AppState>,
    collection_id: String,
    limit: i64,
    cursor_ts: Option<i64>,
    cursor_rowid: Option<i64>,
) -> Result<Vec<Note>, String> {
    state
        .service
        .get_notes_by_collection(GetNotesByCollection {
            collection_id,
            limit: clamp_limit(limit),
            cursor: make_cursor(cursor_ts, cursor_rowid),
        })
        .map_err(to_ipc_err)
}

// ---------------------------------------------------------------------------
// DB path settings
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_db_path_setting() -> String {
    schema::get_db_path().to_string_lossy().to_string()
}

#[tauri::command]
pub fn set_db_path_setting(state: State<AppState>, path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        schema::clear_db_path_config().map_err(to_ipc_err)?;
    } else {
        let data_dir =
            dirs::data_local_dir().ok_or_else(|| "Cannot resolve data directory".to_string())?;
        let p = std::path::Path::new(trimmed);
        let parent = p.parent().ok_or_else(|| "Invalid DB path".to_string())?;
        let canonical_parent = std::fs::canonicalize(parent)
            .map_err(|_| "DB path directory does not exist".to_string())?;
        if !canonical_parent.starts_with(&data_dir) {
            return Err("DB path outside allowed directory".to_string());
        }
        schema::save_db_path_config(trimmed).map_err(to_ipc_err)?;
    }
    let mut wc = state.write_conn.lock().map_err(to_ipc_err)?;
    let mut rc = state.read_conn.lock().map_err(to_ipc_err)?;
    *wc = schema::init().map_err(to_ipc_err)?;
    *rc = schema::init().map_err(to_ipc_err)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let lower = url.to_lowercase();
    if !lower.starts_with("http://")
        && !lower.starts_with("https://")
        && !lower.starts_with("mailto:")
    {
        return Err("Unsupported URL scheme".to_string());
    }
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&url)
        .spawn()
        .map_err(to_ipc_err)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(to_ipc_err)?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &url])
        .spawn()
        .map_err(to_ipc_err)?;
    Ok(())
}
