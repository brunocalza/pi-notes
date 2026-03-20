# Decentralized Note Sync Architecture (SQLite + Automerge + Iroh)

## Overview

We are building a **local-first, decentralized note-taking app** with:

* **SQLite** for local storage and fast queries
* **Automerge** for conflict-free data synchronization (CRDT)
* **Iroh** for peer-to-peer sync (no central server)

### Core Principles

* No central server stores user data
* Each client is a full replica
* Sync is peer-to-peer
* Conflict resolution is handled via CRDT (Automerge)
* SQLite is used as a **read model**, not the source of truth

---

## Architecture

```text
crdt.db (source of truth)
  ├── documents
  ├── crdt_updates
  └── blobs

        ↓ projection

app.db (read model)
  ├── notes
  ├── note_tags
  ├── note_dates
  ├── note_attachments
  └── notes_fts (FTS5)
```

---

## Databases

### 1. CRDT Database (`crdt.db`)

This database stores all syncable state.

#### Tables

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY
);

CREATE TABLE crdt_updates (
  id TEXT PRIMARY KEY,        -- hash of update
  doc_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  update BLOB NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE TABLE blobs (
  hash TEXT PRIMARY KEY,
  data BLOB NOT NULL,
  size INTEGER NOT NULL
);
```

### Notes

* `id` must be a UUID (TEXT)
* `crdt_updates` is append-only
* `update` is a binary Automerge update
* `blobs` stores attachments (content-addressed)

---

### 2. Application Database (`app.db`)

This is a **derived database** used for UI and queries.

#### Schema

```sql
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  in_inbox INTEGER NOT NULL,
  linked_note_id TEXT,
  image_path TEXT,
  trashed INTEGER NOT NULL,
  back_of_mind INTEGER NOT NULL,
  snoozed_until INTEGER
);

CREATE TABLE note_tags (
  note_id TEXT,
  tag TEXT,
  PRIMARY KEY (note_id, tag)
);

CREATE TABLE note_dates (
  note_id TEXT,
  date TEXT,
  PRIMARY KEY (note_id, date)
);

CREATE TABLE note_attachments (
  id TEXT PRIMARY KEY,
  note_id TEXT,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  blob_ref TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

#### FTS

```sql
CREATE VIRTUAL TABLE notes_fts USING fts5(content);
```

* Kept in sync with `notes.content`

---

## Data Model (Automerge)

Each note is stored as an Automerge document:

```json
{
  "title": "string",
  "content": "text (CRDT)",
  "created_at": number,
  "updated_at": number,
  "in_inbox": boolean,
  "trashed": boolean,
  "back_of_mind": boolean,
  "snoozed_until": number | null,
  "linked_note_id": string | null,
  "tags": ["string"],
  "dates": ["string"],
  "attachments": [
    {
      "id": "string",
      "filename": "string",
      "mime_type": "string",
      "blob_ref": "hash",
      "size": number,
      "created_at": number
    }
  ]
}
```

---

## Write Flow

1. Load Automerge document for note
2. Apply change (edit content, update fields, etc.)
3. Generate Automerge update
4. Store update in `crdt_updates`
5. Apply update locally
6. Project document → `app.db`

---

## Projection Layer

Responsible for syncing CRDT state into `app.db`.

### Requirements

* Deterministic (pure function of CRDT state)
* Idempotent
* Can rebuild entire `app.db` from `crdt.db`

### Example

```text
apply_update(update):
  doc = automerge.apply(update)
  state = materialize(doc)

  UPDATE notes SET ...
  DELETE FROM note_tags WHERE note_id = ?
  INSERT INTO note_tags ...
```

---

## Sync Layer (Iroh)

Uses peer-to-peer sync via Iroh.

### Responsibilities

* Discover peers
* Exchange updates
* Retry failed syncs

### Protocol

#### Push

* Send new `crdt_updates` to peers

#### Pull

* Request missing updates

#### Requirements

* Idempotent (updates identified by hash)
* Order-independent (CRDT ensures correctness)
* Retry on failure

---

## Update Identity

Each update must have a unique ID:

```text
id = hash(update_blob)
```

* Used for deduplication
* Required for idempotency

---

## Attachments

* Stored in `blobs` table (content-addressed)
* Referenced in CRDT via `blob_ref`
* Synced separately via Iroh

---

## Rebuild Capability

It must be possible to:

```text
delete app.db
rebuild from crdt.db
```

If not, the design is incorrect.

---

## Constraints

* No direct writes to `app.db`
* All writes go through Automerge
* SQLite tables are projections only
* IDs must be UUIDs (TEXT)

---

## Future Improvements

* Merkle trees for efficient sync
* Bloom filters for update diffing
* Compression for CRDT updates
* Background sync worker
* Multi-device identity management

---

## Summary

* **Automerge** = source of truth
* **SQLite (app.db)** = query layer
* **Iroh** = transport layer
* **CRDT updates** = unit of synchronization

This architecture ensures:

* Offline-first behavior
* Conflict-free merging
* Fully decentralized sync
* High performance queries
