export interface Note {
  id: string;
  rowid: number;
  title: string;
  content: string;
  created_at: string; // ISO string from chrono serde
  updated_at: string;
  in_inbox: boolean;
  trashed: boolean;
  linked_note_id: string | null;
  image_path: string | null;
  tags: string[];
}

export interface AttachmentMeta {
  id: string;
  note_id: string;
  filename: string;
  mime_type: string;
  size: number;
  created_at: string;
}

export type TagEntry = [string, number]; // [tag_name, count]

export type View = "all" | "inbox" | "trash" | { tag: string } | { date: string };

export type ColorTheme = "graphite" | "ink" | "nord" | "dusk" | "forest";
