import { useRef, useEffect } from "react";
import { Plus, Search } from "lucide-react";
import { Note, View } from "../types";
import NoteCard from "./NoteCard";

interface Props {
  notes: Note[];
  view: View;
  searchQuery: string;
  selectedNoteId: number | null;
  searchFocusTrigger: number;
  onSearchChange: (q: string) => void;
  onSelectNote: (id: number) => void;
  onTagClick: (tag: string) => void;
  onAddNote: () => void;
}

function viewTitle(view: View): string {
  if (view === "all") return "My Notes";
  if (view === "inbox") return "Inbox";
  if (view === "trash") return "Trash";
  if (typeof view === "object" && "tag" in view) return `#${view.tag}`;
  return "Notes";
}

export default function Feed({
  notes,
  view,
  searchQuery,
  selectedNoteId,
  searchFocusTrigger,
  onSearchChange,
  onSelectNote,
  onTagClick,
  onAddNote,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  const showSearch = view === "all" || (typeof view === "object" && "tag" in view);

  useEffect(() => {
    if (searchFocusTrigger > 0) searchRef.current?.focus();
  }, [searchFocusTrigger]);

  return (
    <div className="flex flex-col h-full border-r bc-ui shrink-0" style={{ width: 360 }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b bc-subtle shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-xs font-semibold text-lo uppercase tracking-wider">
            {viewTitle(view)}
          </h2>
          {view !== "trash" && (
            <button
              onClick={onAddNote}
              className="flex items-center gap-1 bg-accent-btn hover:bg-accent-btn-hover text-accent text-xs px-2.5 py-1 rounded-md transition-colors"
            >
              <Plus size={12} />
              New
            </button>
          )}
        </div>
        {showSearch && (
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ghost" />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search..."
              className="w-full bg-field border bc-ui rounded text-xs pl-7 pr-2.5 py-1.5 text-md placeholder-[#666] outline-none focus:bc-focus transition-colors"
            />
          </div>
        )}
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto py-1">
        {notes.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-ghost text-xs">
              {searchQuery ? "No results" : "No notes here"}
            </p>
          </div>
        ) : (
          notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              selected={note.id === selectedNoteId}
              onClick={() => onSelectNote(note.id)}
              onTagClick={onTagClick}
            />
          ))
        )}
      </div>
    </div>
  );
}
