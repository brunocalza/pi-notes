import { invoke } from "@tauri-apps/api/core";
import { AttachmentMeta, Note, TagEntry } from "./types";

export const api = {
  listNotes: () =>
    invoke<Note[]>("list_notes"),

  getRecentNotes: () =>
    invoke<Note[]>("get_recent_notes"),

  searchNotes: (query: string) =>
    invoke<Note[]>("search_notes", { query }),

  getInbox: () =>
    invoke<Note[]>("get_inbox"),

  getTrash: () =>
    invoke<Note[]>("get_trash"),

  getNotesByTag: (tag: string) =>
    invoke<Note[]>("get_notes_by_tag", { tag }),

  getAllTags: () =>
    invoke<TagEntry[]>("get_all_tags"),

  insertNote: (title: string, content: string, tags: string[]) =>
    invoke<number>("insert_note", { title, content, tags }),

  getNote: (id: number) =>
    invoke<Note | null>("get_note", { id }),

  updateNote: (id: number, title: string, content: string, tags: string[]) =>
    invoke<void>("update_note", { id, title, content, tags }),

  acceptNote: (id: number) =>
    invoke<void>("accept_note", { id }),

  moveToInbox: (id: number) =>
    invoke<void>("move_to_inbox", { id }),

  trashNote: (id: number) =>
    invoke<void>("trash_note", { id }),

  getBacklinks: (id: number) =>
    invoke<Note[]>("get_backlinks", { id }),

  getAllNoteTitles: () =>
    invoke<string[]>("get_all_note_titles"),

  getNoteByTitle: (title: string) =>
    invoke<Note | null>("get_note_by_title", { title }),

  renameTag: (oldTag: string, newTag: string) =>
    invoke<void>("rename_tag", { oldTag, newTag }),

  deleteTag: (tag: string) =>
    invoke<void>("delete_tag", { tag }),

  emptyTrash: () =>
    invoke<void>("empty_trash"),

  getDbPathSetting: () =>
    invoke<string>("get_db_path_setting"),

  setDbPathSetting: (path: string) =>
    invoke<void>("set_db_path_setting", { path }),

  addAttachment: (noteId: number, filename: string, mimeType: string, data: number[]) =>
    invoke<number>("add_attachment", { noteId, filename, mimeType, data }),

  getAttachments: (noteId: number) =>
    invoke<AttachmentMeta[]>("get_attachments", { noteId }),

  getAttachmentData: (id: number) =>
    invoke<string>("get_attachment_data", { id }),

  deleteAttachment: (id: number) =>
    invoke<void>("delete_attachment", { id }),

  renameAttachment: (id: number, filename: string) =>
    invoke<void>("rename_attachment", { id, filename }),

  openAttachment: (id: number) =>
    invoke<void>("open_attachment", { id }),
};
