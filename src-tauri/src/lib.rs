mod application;
mod domain;
mod infrastructure;
mod ipc;

use std::sync::{Arc, Mutex};

use application::service::AppService;
use infrastructure::{
    attachment_repository::SqliteAttachmentRepository,
    collection_repository::SqliteCollectionRepository, note_repository::SqliteNoteRepository,
    schema, sqlite_reader::SqliteNoteReader, tag_repository::SqliteTagRepository,
};
use ipc::{commands::*, state::AppState};
use tauri::Manager;

pub fn run() {
    let write_conn = Arc::new(Mutex::new(
        schema::init().expect("failed to initialize database"),
    ));
    let read_conn = Arc::new(Mutex::new(
        schema::init().expect("failed to initialize read connection"),
    ));

    let notes = Arc::new(SqliteNoteRepository::new(write_conn.clone()));
    let tags = Arc::new(SqliteTagRepository::new(write_conn.clone()));
    let attachments = Arc::new(SqliteAttachmentRepository::new(write_conn.clone()));
    let reader = Arc::new(SqliteNoteReader::new(read_conn.clone()));
    let collections = Arc::new(SqliteCollectionRepository::new(write_conn.clone()));
    let collection_reader = Arc::new(SqliteCollectionRepository::new(read_conn.clone()));
    let service = Arc::new(AppService::new(
        notes,
        tags,
        attachments,
        reader,
        collections,
        collection_reader,
    ));

    tauri::Builder::default()
        .manage(AppState {
            write_conn,
            read_conn,
            service,
        })
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
            open_url,
            get_notes_by_date,
            get_days_with_notes_in_month,
            list_collections,
            create_collection,
            rename_collection,
            delete_collection,
            set_note_collection,
            get_notes_by_collection_cursor,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
