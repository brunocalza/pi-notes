import { useRef, useEffect, useCallback, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { Collection, Note, View } from "../types";
import { api, Cursor } from "../api";
import NoteCard from "./NoteCard";

const PAGE_SIZE = 50;

interface Props {
  view: View;
  collections: Collection[];
  searchQuery: string;
  selectedNoteId: string | null;
  searchFocusTrigger: number;
  refreshKey: number;
  onSearchChange: (q: string) => void;
  onSelectNote: (id: string) => void;
  onTagClick: (tag: string) => void;
  onAddNote: () => void;
  onEmptyTrash: () => void;
  onNotesChange: (notes: Note[]) => void;
}

function viewTitle(view: View, collections: Collection[]): string {
  if (view === "all") return "My Notes";
  if (view === "inbox") return "Inbox";
  if (view === "trash") return "Trash";
  if (typeof view === "object" && "tag" in view) return `#${view.tag}`;
  if (typeof view === "object" && "date" in view) {
    const [y, m, d] = view.date.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  if (typeof view === "object" && "collection" in view) {
    return collections.find((c) => c.id === view.collection)?.name ?? "Collection";
  }
  return "Notes";
}

function toCursor(note: Note): Cursor {
  return { ts: new Date(note.updated_at).getTime(), rowid: note.rowid };
}

async function fetchPage(view: View, searchQuery: string, cursor: Cursor | null): Promise<Note[]> {
  if (searchQuery.trim()) {
    return api.searchNotesCursor(searchQuery, PAGE_SIZE, cursor);
  }
  if (view === "all") return api.listNotesCursor(PAGE_SIZE, cursor);
  if (view === "inbox") return api.getInboxCursor(PAGE_SIZE, cursor);
  if (view === "trash") return api.getTrashCursor(PAGE_SIZE, cursor);
  if (typeof view === "object" && "tag" in view) {
    return api.getNotesByTagCursor(view.tag, PAGE_SIZE, cursor);
  }
  if (typeof view === "object" && "date" in view) {
    return api.getNotesByDate(view.date);
  }
  if (typeof view === "object" && "collection" in view) {
    return api.getNotesByCollectionCursor(view.collection, PAGE_SIZE, cursor);
  }
  return [];
}

export default function Feed({
  view,
  collections,
  searchQuery,
  selectedNoteId,
  searchFocusTrigger,
  refreshKey,
  onSearchChange,
  onSelectNote,
  onTagClick,
  onAddNote,
  onEmptyTrash,
  onNotesChange,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const showSearch =
    view === "all" ||
    (typeof view === "object" && "tag" in view) ||
    (typeof view === "object" && "collection" in view);

  // State for rendering
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);

  // Refs for use in callbacks / observer (avoid stale closures)
  const notesRef = useRef<Note[]>([]);
  const hasMoreRef = useRef(true);
  const loadingRef = useRef(false);
  const cancelRef = useRef(0);
  const viewRef = useRef(view);
  const searchQueryRef = useRef(searchQuery);

  useEffect(() => {
    if (searchFocusTrigger > 0) searchRef.current?.focus();
  }, [searchFocusTrigger]);

  const loadMore = useCallback(
    async (reset: boolean) => {
      if (loadingRef.current) return;
      if (!reset && !hasMoreRef.current) return;

      loadingRef.current = true;
      setLoading(true);
      cancelRef.current += 1;
      const token = cancelRef.current;

      try {
        const cursor =
          reset || notesRef.current.length === 0
            ? null
            : toCursor(notesRef.current[notesRef.current.length - 1]);

        const fetched = await fetchPage(viewRef.current, searchQueryRef.current, cursor);

        if (cancelRef.current !== token) return;

        const newNotes = reset ? fetched : [...notesRef.current, ...fetched];
        notesRef.current = newNotes;
        hasMoreRef.current = fetched.length === PAGE_SIZE;
        setNotes(newNotes);
        onNotesChange(newNotes);
      } catch (e) {
        if (cancelRef.current !== token) return;
        console.error("Failed to load notes:", e);
      } finally {
        if (cancelRef.current === token) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [onNotesChange]
  );

  // Reset and reload when view / searchQuery / refreshKey change
  useEffect(() => {
    viewRef.current = view;
    searchQueryRef.current = searchQuery;
    hasMoreRef.current = true;
    notesRef.current = [];
    cancelRef.current += 1;
    loadingRef.current = false;
    setNotes([]);
    loadMore(true);
    // loadMore is stable (no deps that change here); view/searchQuery/refreshKey are the triggers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, searchQuery, refreshKey]);

  // IntersectionObserver on the sentinel div to load next page
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingRef.current && hasMoreRef.current) {
        loadMore(false);
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div className="flex flex-col h-full border-r bc-ui shrink-0" style={{ width: 360 }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b bc-subtle shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-xs font-semibold text-lo uppercase tracking-wider">
            {viewTitle(view, collections)}
          </h2>
          {view === "trash" ? (
            notes.length > 0 && (
              <button
                onClick={() => {
                  if (
                    window.confirm("Permanently delete all trashed notes? This cannot be undone.")
                  ) {
                    onEmptyTrash();
                  }
                }}
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 hover:bg-field px-2.5 py-1 rounded-md transition-colors"
              >
                <Trash2 size={12} />
                Empty Trash
              </button>
            )
          ) : (
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
        {notes.length === 0 && !loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-ghost text-xs">{searchQuery ? "No results" : "No notes here"}</p>
          </div>
        ) : (
          <>
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                selected={note.id === selectedNoteId}
                collectionName={
                  view === "all" && note.collection_id
                    ? (collections.find((c) => c.id === note.collection_id)?.name ?? undefined)
                    : undefined
                }
                onClick={() => onSelectNote(note.id)}
                onTagClick={onTagClick}
              />
            ))}
            {/* Sentinel triggers next page load when scrolled into view */}
            <div ref={sentinelRef} className="h-px" />
            {loading && (
              <div className="flex justify-center py-3">
                <div className="w-4 h-4 border-2 border-ghost border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
