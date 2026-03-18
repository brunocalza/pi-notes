mod db;
mod models;
mod tags;

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use models::{AttachmentMeta, Note};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{Manager, State};

pub struct DbState(pub Mutex<Connection>);

fn map_err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
fn list_notes(state: State<DbState>) -> Result<Vec<Note>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::list_notes(&conn).map_err(map_err)
}

#[tauri::command]
fn get_note(state: State<DbState>, id: i64) -> Result<Option<Note>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::get_note(&conn, id).map_err(map_err)
}

#[tauri::command]
fn insert_note(
    state: State<DbState>,
    title: String,
    content: String,
    tags: Vec<String>,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::insert_note(&conn, &title, &content, &tags).map_err(map_err)
}

#[tauri::command]
fn update_note(
    state: State<DbState>,
    id: i64,
    title: String,
    content: String,
    tags: Vec<String>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::update_note(&conn, id, &title, &content, &tags).map_err(map_err)
}

#[tauri::command]
fn delete_note(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::delete_note(&conn, id).map_err(map_err)
}

#[tauri::command]
fn accept_note(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::accept_note(&conn, id).map_err(map_err)
}

#[tauri::command]
fn trash_note(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::trash_note(&conn, id).map_err(map_err)
}

#[tauri::command]
fn restore_note(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::restore_note(&conn, id).map_err(map_err)
}

#[tauri::command]
fn move_to_inbox(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::move_to_inbox(&conn, id).map_err(map_err)
}

#[tauri::command]
fn get_inbox(state: State<DbState>) -> Result<Vec<Note>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::get_inbox(&conn).map_err(map_err)
}

#[tauri::command]
fn get_trash(state: State<DbState>) -> Result<Vec<Note>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::get_trash(&conn).map_err(map_err)
}

#[tauri::command]
fn empty_trash(state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::empty_trash(&conn).map_err(map_err)
}

#[tauri::command]
fn search_notes(state: State<DbState>, query: String) -> Result<Vec<Note>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::search_notes(&conn, &query).map_err(map_err)
}

#[tauri::command]
fn get_notes_by_tag(state: State<DbState>, tag: String) -> Result<Vec<Note>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::get_notes_by_tag(&conn, &tag).map_err(map_err)
}

#[tauri::command]
fn list_notes_cursor(
    state: State<DbState>,
    limit: i64,
    cursor_ts: Option<i64>,
    cursor_id: Option<i64>,
) -> Result<Vec<Note>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::list_notes_cursor(&conn, limit, cursor_ts, cursor_id).map_err(map_err)
}

#[tauri::command]
fn get_inbox_cursor(
    state: State<DbState>,
    limit: i64,
    cursor_ts: Option<i64>,
    cursor_id: Option<i64>,
) -> Result<Vec<Note>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::get_inbox_cursor(&conn, limit, cursor_ts, cursor_id).map_err(map_err)
}

#[tauri::command]
fn get_trash_cursor(
    state: State<DbState>,
    limit: i64,
    cursor_ts: Option<i64>,
    cursor_id: Option<i64>,
) -> Result<Vec<Note>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::get_trash_cursor(&conn, limit, cursor_ts, cursor_id).map_err(map_err)
}

#[tauri::command]
fn get_notes_by_tag_cursor(
    state: State<DbState>,
    tag: String,
    limit: i64,
    cursor_ts: Option<i64>,
    cursor_id: Option<i64>,
) -> Result<Vec<Note>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::get_notes_by_tag_cursor(&conn, &tag, limit, cursor_ts, cursor_id).map_err(map_err)
}

#[tauri::command]
fn search_notes_cursor(
    state: State<DbState>,
    query: String,
    limit: i64,
    cursor_ts: Option<i64>,
    cursor_id: Option<i64>,
) -> Result<Vec<Note>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::search_notes_cursor(&conn, &query, limit, cursor_ts, cursor_id).map_err(map_err)
}

#[tauri::command]
fn get_all_tags(state: State<DbState>) -> Result<Vec<(String, i64)>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::get_all_tags(&conn).map_err(map_err)
}

#[tauri::command]
fn get_all_note_titles(state: State<DbState>) -> Result<Vec<String>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::get_all_note_titles(&conn).map_err(map_err)
}

#[tauri::command]
fn rename_tag(state: State<DbState>, old_tag: String, new_tag: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::rename_tag(&conn, &old_tag, &new_tag).map_err(map_err)
}

#[tauri::command]
fn delete_tag(state: State<DbState>, tag: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::delete_tag(&conn, &tag).map_err(map_err)
}

#[tauri::command]
fn set_note_image(state: State<DbState>, id: i64, path: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::set_note_image(&conn, id, &path).map_err(map_err)
}

#[tauri::command]
fn get_note_by_title(state: State<DbState>, title: String) -> Result<Option<Note>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::get_note_by_title(&conn, &title).map_err(map_err)
}

#[tauri::command]
fn get_backlinks(state: State<DbState>, id: i64) -> Result<Vec<Note>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::get_backlinks(&conn, id).map_err(map_err)
}

#[tauri::command]
fn get_recent_notes(state: State<DbState>) -> Result<Vec<Note>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::get_recent_notes(&conn, 5).map_err(map_err)
}

#[tauri::command]
fn get_db_path_setting() -> String {
    db::get_db_path().to_string_lossy().to_string()
}

#[tauri::command]
fn set_db_path_setting(state: State<DbState>, path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        db::clear_db_path_config().map_err(map_err)?;
    } else {
        db::save_db_path_config(trimmed).map_err(map_err)?;
    }
    let new_conn = db::init().map_err(map_err)?;
    let mut conn = state.0.lock().map_err(map_err)?;
    *conn = new_conn;
    Ok(())
}

#[tauri::command]
fn add_attachment(
    state: State<DbState>,
    note_id: i64,
    filename: String,
    mime_type: String,
    data: Vec<u8>,
) -> Result<i64, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::add_attachment(&conn, note_id, &filename, &mime_type, &data).map_err(map_err)
}

#[tauri::command]
fn get_attachments(state: State<DbState>, note_id: i64) -> Result<Vec<AttachmentMeta>, String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::get_attachments(&conn, note_id).map_err(map_err)
}

#[tauri::command]
fn get_attachment_data(state: State<DbState>, id: i64) -> Result<String, String> {
    let conn = state.0.lock().map_err(map_err)?;
    let data = db::get_attachment_data(&conn, id).map_err(map_err)?;
    Ok(BASE64.encode(&data))
}

#[tauri::command]
fn delete_attachment(state: State<DbState>, id: i64) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::delete_attachment(&conn, id).map_err(map_err)
}

#[tauri::command]
fn rename_attachment(state: State<DbState>, id: i64, filename: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(map_err)?;
    db::rename_attachment(&conn, id, &filename).map_err(map_err)
}

#[tauri::command]
fn open_attachment(state: State<DbState>, id: i64) -> Result<(), String> {
    let (filename, data) = {
        let conn = state.0.lock().map_err(map_err)?;
        let meta = db::get_attachment_meta(&conn, id)
            .map_err(map_err)?
            .ok_or_else(|| "Attachment not found".to_string())?;
        let data = db::get_attachment_data(&conn, id).map_err(map_err)?;
        (meta.filename, data)
    };
    let path = std::env::temp_dir().join(&filename);
    std::fs::write(&path, &data).map_err(map_err)?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(map_err)?;
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(map_err)?;
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &path.to_string_lossy()])
        .spawn()
        .map_err(map_err)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(DbState(Mutex::new(
            db::init().expect("failed to initialize database"),
        )))
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let icon =
                tauri::image::Image::from_bytes(include_bytes!("../icons/logo.png")).unwrap();
            window.set_icon(icon).unwrap();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_notes,
            list_notes_cursor,
            get_inbox_cursor,
            get_trash_cursor,
            get_notes_by_tag_cursor,
            search_notes_cursor,
            get_note,
            insert_note,
            update_note,
            delete_note,
            accept_note,
            trash_note,
            restore_note,
            move_to_inbox,
            get_inbox,
            get_trash,
            search_notes,
            get_notes_by_tag,
            get_all_tags,
            get_all_note_titles,
            rename_tag,
            delete_tag,
            set_note_image,
            get_note_by_title,
            get_backlinks,
            empty_trash,
            get_recent_notes,
            get_db_path_setting,
            set_db_path_setting,
            add_attachment,
            get_attachments,
            get_attachment_data,
            delete_attachment,
            rename_attachment,
            open_attachment,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
