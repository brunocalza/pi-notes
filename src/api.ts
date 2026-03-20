import { invoke } from "@tauri-apps/api/core";
import { AttachmentMeta, Note, TagEntry } from "./types";

export interface Cursor {
  ts: number;
  rowid: number;
}

export const api = {
  listNotes: () => invoke<Note[]>("list_notes"),

  listNotesCursor: (limit: number, cursor: Cursor | null) =>
    invoke<Note[]>("list_notes_cursor", {
      limit,
      cursorTs: cursor?.ts ?? null,
      cursorRowid: cursor?.rowid ?? null,
    }),

  getInboxCursor: (limit: number, cursor: Cursor | null) =>
    invoke<Note[]>("get_inbox_cursor", {
      limit,
      cursorTs: cursor?.ts ?? null,
      cursorRowid: cursor?.rowid ?? null,
    }),

  getTrashCursor: (limit: number, cursor: Cursor | null) =>
    invoke<Note[]>("get_trash_cursor", {
      limit,
      cursorTs: cursor?.ts ?? null,
      cursorRowid: cursor?.rowid ?? null,
    }),

  getNotesByTagCursor: (tag: string, limit: number, cursor: Cursor | null) =>
    invoke<Note[]>("get_notes_by_tag_cursor", {
      tag,
      limit,
      cursorTs: cursor?.ts ?? null,
      cursorRowid: cursor?.rowid ?? null,
    }),

  searchNotesCursor: (query: string, limit: number, cursor: Cursor | null) =>
    invoke<Note[]>("search_notes_cursor", {
      query,
      limit,
      cursorTs: cursor?.ts ?? null,
      cursorRowid: cursor?.rowid ?? null,
    }),

  getRecentNotes: () => invoke<Note[]>("get_recent_notes"),

  searchNotes: (query: string) => invoke<Note[]>("search_notes", { query }),

  getInbox: () => invoke<Note[]>("get_inbox"),

  getTrash: () => invoke<Note[]>("get_trash"),

  getNotesByTag: (tag: string) => invoke<Note[]>("get_notes_by_tag", { tag }),

  getAllTags: () => invoke<TagEntry[]>("get_all_tags"),

  insertNote: (title: string, content: string, tags: string[]) =>
    invoke<string>("insert_note", { title, content, tags }),

  getNote: (id: string) => invoke<Note | null>("get_note", { id }),

  updateNote: (id: string, title: string, content: string, tags: string[]) =>
    invoke<void>("update_note", { id, title, content, tags }),

  acceptNote: (id: string) => invoke<void>("accept_note", { id }),

  moveToInbox: (id: string) => invoke<void>("move_to_inbox", { id }),

  trashNote: (id: string) => invoke<void>("trash_note", { id }),

  deleteNote: (id: string) => invoke<void>("delete_note", { id }),

  getBacklinks: (id: string) => invoke<Note[]>("get_backlinks", { id }),

  getAllNoteTitles: () => invoke<string[]>("get_all_note_titles"),

  getNoteByTitle: (title: string) => invoke<Note | null>("get_note_by_title", { title }),

  renameTag: (oldTag: string, newTag: string) => invoke<void>("rename_tag", { oldTag, newTag }),

  deleteTag: (tag: string) => invoke<void>("delete_tag", { tag }),

  emptyTrash: () => invoke<void>("empty_trash"),

  getDbPathSetting: () => invoke<string>("get_db_path_setting"),

  setDbPathSetting: (path: string) => invoke<void>("set_db_path_setting", { path }),

  addAttachment: (noteId: string, filename: string, mimeType: string, data: number[]) =>
    invoke<string>("add_attachment", { noteId, filename, mimeType, data }),

  getAttachments: (noteId: string) => invoke<AttachmentMeta[]>("get_attachments", { noteId }),

  getAttachmentData: (id: string) => invoke<string>("get_attachment_data", { id }),

  deleteAttachment: (id: string) => invoke<void>("delete_attachment", { id }),

  renameAttachment: (id: string, filename: string) =>
    invoke<void>("rename_attachment", { id, filename }),

  openAttachment: (id: string) => invoke<void>("open_attachment", { id }),

  openUrl: (url: string) => invoke<void>("open_url", { url }),

  getNotesByDate: (date: string) => invoke<Note[]>("get_notes_by_date", { date }),

  getDaysWithNotesInMonth: (yearMonth: string) =>
    invoke<number[]>("get_days_with_notes_in_month", { yearMonth }),
};
