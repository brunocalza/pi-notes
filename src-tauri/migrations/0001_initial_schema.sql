-- Initial schema for pi-notes
-- All tables, indexes, triggers, and FTS virtual table.

CREATE TABLE IF NOT EXISTS notes (
    id             TEXT    PRIMARY KEY,
    title          TEXT    NOT NULL DEFAULT '',
    content        TEXT    NOT NULL,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    in_inbox       INTEGER NOT NULL DEFAULT 1,
    linked_note_id TEXT    REFERENCES notes(id) ON DELETE SET NULL,
    image_path     TEXT,
    trashed        INTEGER NOT NULL DEFAULT 0,
    back_of_mind   INTEGER NOT NULL DEFAULT 0,
    snoozed_until  INTEGER,
    collection_id  TEXT    REFERENCES collections(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag     TEXT NOT NULL,
    PRIMARY KEY (note_id, tag)
);

CREATE TABLE IF NOT EXISTS note_dates (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    date    TEXT NOT NULL,
    PRIMARY KEY (note_id, date)
);

CREATE TABLE IF NOT EXISTS note_attachments (
    id          TEXT    PRIMARY KEY,
    note_id     TEXT    NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    filename    TEXT    NOT NULL,
    mime_type   TEXT    NOT NULL,
    data        BLOB    NOT NULL,
    size        INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS note_links (
    source_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    PRIMARY KEY (source_note_id, target_note_id)
);

CREATE TABLE IF NOT EXISTS collections (
    id         TEXT    PRIMARY KEY,
    name       TEXT    NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Full-text search (external-content FTS5 backed by the notes table)
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    content,
    content=notes,
    content_rowid=rowid
);

-- Triggers to keep FTS in sync with the notes table

DROP TRIGGER IF EXISTS notes_ai;
CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, content) VALUES (new.rowid, new.content);
END;

DROP TRIGGER IF EXISTS notes_ad;
CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;

DROP TRIGGER IF EXISTS notes_au;
CREATE TRIGGER notes_au AFTER UPDATE OF content ON notes
WHEN old.content != new.content
BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, content) VALUES('delete', old.rowid, old.content);
    INSERT INTO notes_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- Indexes

CREATE INDEX IF NOT EXISTS idx_notes_list
    ON notes(in_inbox, trashed, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_trash
    ON notes(trashed, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_note_tags_tag
    ON note_tags(tag, note_id);

CREATE INDEX IF NOT EXISTS idx_note_dates_date
    ON note_dates(date);

CREATE INDEX IF NOT EXISTS idx_note_links_target
    ON note_links(target_note_id);

CREATE INDEX IF NOT EXISTS idx_notes_collection
    ON notes(collection_id);
