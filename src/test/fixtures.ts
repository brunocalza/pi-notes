import { Note } from "../types";

export const makeNote = (overrides: Partial<Note> = {}): Note => ({
  id: "00000000-0000-0000-0000-000000000001",
  rowid: 1,
  title: "Test Note",
  content: "Hello world",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  in_inbox: true,
  trashed: false,
  linked_note_id: null,
  image_path: null,
  tags: [],
  ...overrides,
});
