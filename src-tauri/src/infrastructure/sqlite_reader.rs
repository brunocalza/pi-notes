use chrono::{DateTime, Utc};
use rusqlite::{params, Connection};
use std::sync::{Arc, Mutex};

use crate::application::{
    ports::note_reader::NoteReader,
    queries::note::{GetNotesByDate, GetNotesByTag, ListInbox, ListNotes, ListTrash, SearchNotes},
};
use crate::domain::{
    attachment::{AttachmentId, AttachmentMeta},
    error::DomainError,
    note::{Note, NoteId},
    tag::Tag,
};

pub struct SqliteNoteReader {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteNoteReader {
    pub fn new(conn: Arc<Mutex<Connection>>) -> Self {
        Self { conn }
    }
}

fn map_err(e: impl std::fmt::Display) -> DomainError {
    DomainError::StorageError(e.to_string())
}

fn ms_to_dt(ms: i64) -> DateTime<Utc> {
    DateTime::from_timestamp_millis(ms).unwrap_or_else(Utc::now)
}

// Columns: 0=id 1=rowid 2=title 3=content 4=created_at 5=updated_at
//          6=in_inbox 7=linked_note_id 8=image_path 9=trashed 10=tags
const SELECT: &str = "
    SELECT n.id, n.rowid, n.title, n.content, n.created_at, n.updated_at,
           n.in_inbox, n.linked_note_id, n.image_path, n.trashed,
           GROUP_CONCAT(t.tag, ',') as tags
    FROM notes n
    LEFT JOIN note_tags t ON t.note_id = n.id";

fn row_to_note(row: &rusqlite::Row<'_>) -> rusqlite::Result<Note> {
    let tags_csv: Option<String> = row.get(10)?;
    let tags = tags_csv
        .map(|s| s.split(',').filter_map(Tag::parse).collect())
        .unwrap_or_default();

    Ok(Note {
        id: NoteId(row.get::<_, String>(0)?),
        rowid: row.get(1)?,
        title: row.get(2)?,
        content: row.get(3)?,
        created_at: ms_to_dt(row.get(4)?),
        updated_at: ms_to_dt(row.get(5)?),
        in_inbox: row.get::<_, i32>(6)? != 0,
        trashed: row.get::<_, i32>(9)? != 0,
        linked_note_id: row.get::<_, Option<String>>(7)?.map(NoteId),
        image_path: row.get(8)?,
        tags,
    })
}

fn prepare_fts_query(query: &str) -> String {
    if query.contains('"')
        || query.contains('*')
        || query.contains('^')
        || query.contains("AND")
        || query.contains("OR")
        || query.contains("NOT")
    {
        return query.to_string();
    }
    query
        .split_whitespace()
        .map(|w| format!("\"{w}\"*"))
        .collect::<Vec<_>>()
        .join(" ")
}

impl NoteReader for SqliteNoteReader {
    fn get_note(&self, id: NoteId) -> Result<Option<Note>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let sql = format!("{SELECT} WHERE n.id = ?1 GROUP BY n.id");
        let mut stmt = conn.prepare(&sql).map_err(map_err)?;
        Ok(stmt.query_row(params![id.as_str()], row_to_note).ok())
    }

    fn get_note_by_title(&self, title: &str) -> Result<Option<Note>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let sql = format!("{SELECT} WHERE lower(n.title) = lower(?1) GROUP BY n.id LIMIT 1");
        let mut stmt = conn.prepare(&sql).map_err(map_err)?;
        Ok(stmt.query_row(params![title], row_to_note).ok())
    }

    fn list_notes(&self, q: ListNotes) -> Result<Vec<Note>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let rows = match q.cursor {
            Some(c) => {
                let sql = format!(
                    "{SELECT}
                     WHERE n.in_inbox = 0 AND n.trashed = 0
                       AND (n.updated_at < ?2 OR (n.updated_at = ?2 AND n.rowid < ?3))
                     GROUP BY n.id ORDER BY n.updated_at DESC, n.rowid DESC LIMIT ?1"
                );
                conn.prepare(&sql)
                    .map_err(map_err)?
                    .query_map(params![q.limit, c.ts, c.rowid], row_to_note)
                    .map_err(map_err)?
                    .collect::<rusqlite::Result<_>>()
                    .map_err(map_err)?
            }
            None => {
                let sql = format!(
                    "{SELECT}
                     WHERE n.in_inbox = 0 AND n.trashed = 0
                     GROUP BY n.id ORDER BY n.updated_at DESC, n.rowid DESC LIMIT ?1"
                );
                conn.prepare(&sql)
                    .map_err(map_err)?
                    .query_map(params![q.limit], row_to_note)
                    .map_err(map_err)?
                    .collect::<rusqlite::Result<_>>()
                    .map_err(map_err)?
            }
        };
        Ok(rows)
    }

    fn list_inbox(&self, q: ListInbox) -> Result<Vec<Note>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let rows = match q.cursor {
            Some(c) => {
                let sql = format!(
                    "{SELECT}
                     WHERE n.in_inbox = 1 AND n.trashed = 0
                       AND (n.updated_at < ?2 OR (n.updated_at = ?2 AND n.rowid < ?3))
                     GROUP BY n.id ORDER BY n.updated_at DESC, n.rowid DESC LIMIT ?1"
                );
                conn.prepare(&sql)
                    .map_err(map_err)?
                    .query_map(params![q.limit, c.ts, c.rowid], row_to_note)
                    .map_err(map_err)?
                    .collect::<rusqlite::Result<_>>()
                    .map_err(map_err)?
            }
            None => {
                let sql = format!(
                    "{SELECT}
                     WHERE n.in_inbox = 1 AND n.trashed = 0
                     GROUP BY n.id ORDER BY n.updated_at DESC, n.rowid DESC LIMIT ?1"
                );
                conn.prepare(&sql)
                    .map_err(map_err)?
                    .query_map(params![q.limit], row_to_note)
                    .map_err(map_err)?
                    .collect::<rusqlite::Result<_>>()
                    .map_err(map_err)?
            }
        };
        Ok(rows)
    }

    fn list_trash(&self, q: ListTrash) -> Result<Vec<Note>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let rows = match q.cursor {
            Some(c) => {
                let sql = format!(
                    "{SELECT}
                     WHERE n.trashed = 1
                       AND (n.updated_at < ?2 OR (n.updated_at = ?2 AND n.rowid < ?3))
                     GROUP BY n.id ORDER BY n.updated_at DESC, n.rowid DESC LIMIT ?1"
                );
                conn.prepare(&sql)
                    .map_err(map_err)?
                    .query_map(params![q.limit, c.ts, c.rowid], row_to_note)
                    .map_err(map_err)?
                    .collect::<rusqlite::Result<_>>()
                    .map_err(map_err)?
            }
            None => {
                let sql = format!(
                    "{SELECT}
                     WHERE n.trashed = 1
                     GROUP BY n.id ORDER BY n.updated_at DESC, n.rowid DESC LIMIT ?1"
                );
                conn.prepare(&sql)
                    .map_err(map_err)?
                    .query_map(params![q.limit], row_to_note)
                    .map_err(map_err)?
                    .collect::<rusqlite::Result<_>>()
                    .map_err(map_err)?
            }
        };
        Ok(rows)
    }

    fn search_notes(&self, q: SearchNotes) -> Result<Vec<Note>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let fts_query = prepare_fts_query(&q.query);
        let like_query = format!("%{}%", q.query.trim());
        let rows = match q.cursor {
            Some(c) => {
                let sql = format!(
                    "{SELECT}
                     WHERE n.in_inbox = 0 AND n.trashed = 0
                       AND (n.rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?1)
                            OR lower(n.title) LIKE lower(?2))
                       AND (n.updated_at < ?4 OR (n.updated_at = ?4 AND n.rowid < ?5))
                     GROUP BY n.id
                     ORDER BY n.updated_at DESC, n.rowid DESC
                     LIMIT ?3"
                );
                conn.prepare(&sql)
                    .map_err(map_err)?
                    .query_map(
                        params![fts_query, like_query, q.limit, c.ts, c.rowid],
                        row_to_note,
                    )
                    .map_err(map_err)?
                    .collect::<rusqlite::Result<_>>()
                    .map_err(map_err)?
            }
            None => {
                let sql = format!(
                    "{SELECT}
                     WHERE n.in_inbox = 0 AND n.trashed = 0
                       AND (n.rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?1)
                            OR lower(n.title) LIKE lower(?2))
                     GROUP BY n.id
                     ORDER BY n.updated_at DESC, n.rowid DESC
                     LIMIT ?3"
                );
                conn.prepare(&sql)
                    .map_err(map_err)?
                    .query_map(params![fts_query, like_query, q.limit], row_to_note)
                    .map_err(map_err)?
                    .collect::<rusqlite::Result<_>>()
                    .map_err(map_err)?
            }
        };
        Ok(rows)
    }

    fn get_notes_by_tag(&self, q: GetNotesByTag) -> Result<Vec<Note>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let tag = q.tag.trim_start_matches('#');
        let rows = match q.cursor {
            Some(c) => {
                let sql = format!(
                    "{SELECT}
                     WHERE n.in_inbox = 0 AND n.trashed = 0
                       AND n.id IN (SELECT note_id FROM note_tags WHERE tag = ?1)
                       AND (n.updated_at < ?3 OR (n.updated_at = ?3 AND n.rowid < ?4))
                     GROUP BY n.id ORDER BY n.updated_at DESC, n.rowid DESC LIMIT ?2"
                );
                conn.prepare(&sql)
                    .map_err(map_err)?
                    .query_map(params![tag, q.limit, c.ts, c.rowid], row_to_note)
                    .map_err(map_err)?
                    .collect::<rusqlite::Result<_>>()
                    .map_err(map_err)?
            }
            None => {
                let sql = format!(
                    "{SELECT}
                     WHERE n.in_inbox = 0 AND n.trashed = 0
                       AND n.id IN (SELECT note_id FROM note_tags WHERE tag = ?1)
                     GROUP BY n.id ORDER BY n.updated_at DESC, n.rowid DESC LIMIT ?2"
                );
                conn.prepare(&sql)
                    .map_err(map_err)?
                    .query_map(params![tag, q.limit], row_to_note)
                    .map_err(map_err)?
                    .collect::<rusqlite::Result<_>>()
                    .map_err(map_err)?
            }
        };
        Ok(rows)
    }

    fn get_notes_by_date(&self, q: GetNotesByDate) -> Result<Vec<Note>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let sql = format!(
            "{SELECT}
             WHERE n.in_inbox = 0 AND n.trashed = 0
               AND n.id IN (SELECT note_id FROM note_dates WHERE date = ?1)
             GROUP BY n.id
             ORDER BY n.created_at DESC"
        );
        let mut stmt = conn.prepare(&sql).map_err(map_err)?;
        let rows = stmt
            .query_map(params![q.date], row_to_note)
            .map_err(map_err)?
            .collect::<rusqlite::Result<_>>()
            .map_err(map_err)?;
        Ok(rows)
    }

    fn get_backlinks(&self, id: NoteId) -> Result<Vec<Note>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let title: String = match conn.query_row(
            "SELECT title FROM notes WHERE id = ?1",
            params![id.as_str()],
            |row| row.get(0),
        ) {
            Ok(t) => t,
            Err(_) => return Ok(vec![]),
        };
        if title.is_empty() {
            return Ok(vec![]);
        }
        let pattern = format!("%[[{title}]]%");
        let sql = format!(
            "{SELECT}
             WHERE n.id != ?2 AND n.trashed = 0 AND n.content LIKE ?1
             GROUP BY n.id
             ORDER BY n.updated_at DESC"
        );
        let mut stmt = conn.prepare(&sql).map_err(map_err)?;
        let rows = stmt
            .query_map(params![pattern, id.as_str()], row_to_note)
            .map_err(map_err)?
            .collect::<rusqlite::Result<_>>()
            .map_err(map_err)?;
        Ok(rows)
    }

    fn get_recent_notes(&self) -> Result<Vec<Note>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let sql = format!(
            "{SELECT}
             WHERE n.trashed = 0 AND n.in_inbox = 0
             GROUP BY n.id ORDER BY n.updated_at DESC LIMIT 5"
        );
        let mut stmt = conn.prepare(&sql).map_err(map_err)?;
        let rows = stmt
            .query_map([], row_to_note)
            .map_err(map_err)?
            .collect::<rusqlite::Result<_>>()
            .map_err(map_err)?;
        Ok(rows)
    }

    fn get_all_tags(&self) -> Result<Vec<(String, i64)>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let mut stmt = conn
            .prepare(
                "SELECT t.tag, COUNT(*) FROM note_tags t
                 JOIN notes n ON n.id = t.note_id
                 WHERE n.in_inbox = 0 AND n.trashed = 0
                 GROUP BY t.tag ORDER BY 1",
            )
            .map_err(map_err)?;
        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(map_err)?
            .collect::<rusqlite::Result<_>>()
            .map_err(map_err)?;
        Ok(rows)
    }

    fn get_all_note_titles(&self) -> Result<Vec<String>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let mut stmt = conn
            .prepare(
                "SELECT title FROM notes WHERE title != '' AND trashed = 0 ORDER BY title COLLATE NOCASE",
            )
            .map_err(map_err)?;
        let rows = stmt
            .query_map([], |row| row.get(0))
            .map_err(map_err)?
            .collect::<rusqlite::Result<_>>()
            .map_err(map_err)?;
        Ok(rows)
    }

    fn get_days_with_notes_in_month(&self, year_month: &str) -> Result<Vec<u32>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let pattern = format!("{year_month}-__");
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT CAST(substr(nd.date, 9, 2) AS INTEGER)
                 FROM note_dates nd
                 JOIN notes n ON n.id = nd.note_id
                 WHERE nd.date LIKE ?1
                   AND n.in_inbox = 0 AND n.trashed = 0",
            )
            .map_err(map_err)?;
        let mut days: Vec<u32> = stmt
            .query_map(params![pattern], |row| row.get::<_, u32>(0))
            .map_err(map_err)?
            .collect::<rusqlite::Result<_>>()
            .map_err(map_err)?;
        days.sort();
        Ok(days)
    }

    fn get_attachments(&self, note_id: NoteId) -> Result<Vec<AttachmentMeta>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let mut stmt = conn
            .prepare(
                "SELECT id, note_id, filename, mime_type, size, created_at
                 FROM note_attachments WHERE note_id = ?1 ORDER BY created_at ASC",
            )
            .map_err(map_err)?;
        let rows = stmt
            .query_map(params![note_id.as_str()], |row| {
                Ok(AttachmentMeta {
                    id: crate::domain::attachment::AttachmentId(row.get::<_, String>(0)?),
                    note_id: NoteId(row.get::<_, String>(1)?),
                    filename: row.get(2)?,
                    mime_type: row.get(3)?,
                    size: row.get(4)?,
                    created_at: ms_to_dt(row.get::<_, i64>(5)?),
                })
            })
            .map_err(map_err)?
            .collect::<rusqlite::Result<_>>()
            .map_err(map_err)?;
        Ok(rows)
    }

    fn get_attachment_data(&self, id: AttachmentId) -> Result<Vec<u8>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let data: Vec<u8> = conn
            .query_row(
                "SELECT data FROM note_attachments WHERE id = ?1",
                params![id.as_str()],
                |row| row.get(0),
            )
            .map_err(map_err)?;
        Ok(data)
    }

    fn get_attachment_meta(&self, id: AttachmentId) -> Result<Option<AttachmentMeta>, DomainError> {
        let conn = self.conn.lock().map_err(map_err)?;
        let mut stmt = conn
            .prepare(
                "SELECT id, note_id, filename, mime_type, size, created_at
                 FROM note_attachments WHERE id = ?1",
            )
            .map_err(map_err)?;
        Ok(stmt
            .query_row(params![id.as_str()], |row| {
                Ok(AttachmentMeta {
                    id: crate::domain::attachment::AttachmentId(row.get::<_, String>(0)?),
                    note_id: NoteId(row.get::<_, String>(1)?),
                    filename: row.get(2)?,
                    mime_type: row.get(3)?,
                    size: row.get(4)?,
                    created_at: ms_to_dt(row.get::<_, i64>(5)?),
                })
            })
            .ok())
    }
}
