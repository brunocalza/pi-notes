export interface Note {
  id: number;
  title: string;
  content: string;
  created_at: string; // ISO string from chrono serde
  updated_at: string;
  in_inbox: boolean;
  trashed: boolean;
  linked_note_id: number | null;
  image_path: string | null;
  tags: string[];
}

export type TagEntry = [string, number]; // [tag_name, count]

export type View =
  | "all"
  | "inbox"
  | "trash"
  | { tag: string };

export type ColorTheme = "graphite" | "ink" | "nord" | "dusk" | "forest";
