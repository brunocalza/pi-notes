use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use tauri::State;

use crate::application::{
    commands::{
        attachment::{AddAttachment, RenameAttachment},
        note::{CreateNote, SetNoteImage, UpdateNote},
        tag::{DeleteTag, RenameTag},
    },
    queries::note::{
        Cursor, GetNotesByDate, GetNotesByTag, ListInbox, ListNotes, ListTrash, SearchNotes,
    },
};
use crate::domain::{
    attachment::{AttachmentId, AttachmentMeta},
    note::{Note, NoteId},
};
use crate::infrastructure::schema;
use crate::ipc::state::AppState;

fn to_ipc_err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn make_cursor(ts: Option<i64>, rowid: Option<i64>) -> Option<Cursor> {
    match (ts, rowid) {
        (Some(ts), Some(rowid)) => Some(Cursor { ts, rowid }),
        _ => None,
    }
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
            limit,
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
            limit,
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
            limit,
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
            limit,
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
            limit,
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
    let path = std::env::temp_dir().join(&filename);
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
