use rusqlite::Connection;
use std::sync::{Arc, Mutex};

use crate::application::service::AppService;

pub struct AppState {
    pub write_conn: Arc<Mutex<Connection>>,
    pub read_conn: Arc<Mutex<Connection>>,
    pub service: Arc<AppService>,
}
