mod db;
mod models;
mod tags;

use models::Note;
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::State;

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

pub fn run() {
    tauri::Builder::default()
        .manage(DbState(Mutex::new(
            db::init().expect("failed to initialize database"),
        )))
        .invoke_handler(tauri::generate_handler![
            list_notes,
            get_note,
            insert_note,
            update_note,
            delete_note,
            accept_note,
            trash_note,
            restore_note,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
