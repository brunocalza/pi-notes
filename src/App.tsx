import { useState, useEffect, useCallback, useRef } from "react";
import { Collection, Note, TagEntry, View, ColorTheme } from "./types";
import { api } from "./api";
import Sidebar from "./components/Sidebar";
import Feed from "./components/Feed";
import NoteDetail from "./components/NoteDetail";
import { useToast } from "./hooks/useToast";

export default function App() {
  const { error: toastError } = useToast();
  const [view, setView] = useState<View>("all");
  const [tags, setTags] = useState<TagEntry[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [focusNewNote, setFocusNewNote] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocusTrigger, setSearchFocusTrigger] = useState(0);
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("theme") as "dark" | "light") || "dark";
  });
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => {
    return (localStorage.getItem("colorTheme") as ColorTheme) || "graphite";
  });

  useEffect(() => {
    const el = document.documentElement;
    el.classList.remove("theme-ink", "theme-nord", "theme-dusk", "theme-forest");
    if (colorTheme !== "graphite") el.classList.add(`theme-${colorTheme}`);
    if (theme === "light") el.classList.add("light");
    else el.classList.remove("light");
    localStorage.setItem("theme", theme);
    localStorage.setItem("colorTheme", colorTheme);
  }, [theme, colorTheme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const loadSidebar = useCallback(async () => {
    try {
      const [allTags, inbox, allCollections] = await Promise.all([
        api.getAllTags(),
        api.getInbox(),
        api.listCollections(),
      ]);
      setTags(allTags);
      setInboxCount(inbox.length);
      setCollections(allCollections);
    } catch (e) {
      toastError(`Failed to load sidebar: ${String(e)}`);
    }
  }, [toastError]);

  useEffect(() => {
    loadSidebar();
  }, [loadSidebar]);

  const refresh = useCallback(() => {
    setFeedRefreshKey((k) => k + 1);
    loadSidebar();
  }, [loadSidebar]);

  const handleAddNote = useCallback(async () => {
    try {
      const id = await api.insertNote("New note", "", []);
      if (typeof view === "object" && "collection" in view) {
        await api.setNoteCollection(id, view.collection);
      }
      setView("inbox");
      setSearchQuery("");
      setFeedRefreshKey((k) => k + 1);
      loadSidebar();
      setFocusNewNote(true);
      setSelectedNoteId(id);
    } catch (e) {
      toastError(`Failed to create note: ${String(e)}`);
    }
  }, [loadSidebar, toastError, view]);

  // Stale-closure-safe refs for global shortcuts — notes updated via onNotesChange
  const stateRef = useRef({ selectedNoteId, notes: [] as Note[], view });
  useEffect(() => {
    stateRef.current = { ...stateRef.current, selectedNoteId, view };
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const inInput =
        tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable;

      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        handleAddNote();
        return;
      }
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        setView("all");
        setSearchQuery("");
        setSearchFocusTrigger((t) => t + 1);
        return;
      }
      if (e.ctrlKey && e.key === "1") {
        e.preventDefault();
        setView("inbox");
        setSearchQuery("");
        setSelectedNoteId(null);
        return;
      }
      if (e.ctrlKey && e.key === "2") {
        e.preventDefault();
        setView("all");
        setSearchQuery("");
        setSelectedNoteId(null);
        return;
      }
      if (e.ctrlKey && e.key === "3") {
        e.preventDefault();
        setView("trash");
        setSearchQuery("");
        setSelectedNoteId(null);
        return;
      }

      if (inInput) return;

      if (e.key === "Escape") {
        setSelectedNoteId(null);
        setFocusNewNote(false);
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const { notes: ns, selectedNoteId: sel } = stateRef.current;
        if (ns.length === 0) return;
        const idx = ns.findIndex((n) => n.id === sel);
        const next =
          e.key === "ArrowDown"
            ? idx === -1
              ? 0
              : Math.min(idx + 1, ns.length - 1)
            : idx === -1
              ? ns.length - 1
              : Math.max(idx - 1, 0);
        setSelectedNoteId(ns[next].id);
        return;
      }

      if (e.ctrlKey && e.key === "Backspace") {
        const { selectedNoteId: sel } = stateRef.current;
        if (sel != null) {
          api
            .trashNote(sel)
            .then(() => {
              setSelectedNoteId(null);
              refresh();
            })
            .catch((e) => toastError(`Failed to trash note: ${String(e)}`));
        }
        return;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleAddNote, refresh, toastError]);

  const handleViewChange = (v: View) => {
    setView(v);
    setSearchQuery("");
    setSelectedNoteId(null);
  };

  return (
    <div className="flex h-screen w-full bg-app">
      <Sidebar
        view={view}
        tags={tags}
        collections={collections}
        inboxCount={inboxCount}
        theme={theme}
        colorTheme={colorTheme}
        refreshKey={feedRefreshKey}
        onViewChange={handleViewChange}
        onTagRename={refresh}
        onTagDelete={refresh}
        onCollectionClick={(id) => handleViewChange({ collection: id })}
        onCreateCollection={async (name) => {
          await api.createCollection(name);
          loadSidebar();
        }}
        onRenameCollection={async (id, newName) => {
          await api.renameCollection(id, newName);
          loadSidebar();
        }}
        onDeleteCollection={async (id) => {
          await api.deleteCollection(id);
          if (typeof view === "object" && "collection" in view && view.collection === id) {
            handleViewChange("all");
          }
          loadSidebar();
        }}
        onThemeToggle={toggleTheme}
        onColorThemeChange={setColorTheme}
        onDbPathChange={refresh}
      />

      <Feed
        view={view}
        collections={collections}
        searchQuery={searchQuery}
        selectedNoteId={selectedNoteId}
        searchFocusTrigger={searchFocusTrigger}
        refreshKey={feedRefreshKey}
        onSearchChange={setSearchQuery}
        onSelectNote={setSelectedNoteId}
        onTagClick={(tag) => handleViewChange({ tag })}
        onAddNote={handleAddNote}
        onEmptyTrash={async () => {
          await api.emptyTrash();
          setSelectedNoteId(null);
          refresh();
        }}
        onNotesChange={(notes) => {
          stateRef.current.notes = notes;
        }}
      />

      {selectedNoteId != null ? (
        <NoteDetail
          key={selectedNoteId}
          noteId={selectedNoteId}
          focusTitle={focusNewNote}
          collections={collections}
          onNavigate={(id) => {
            setFocusNewNote(false);
            setSelectedNoteId(id);
          }}
          onTagClick={(tag) => handleViewChange({ tag })}
          onDateSelect={(date) => handleViewChange({ date })}
          onDeselect={() => {
            setFocusNewNote(false);
            setSelectedNoteId(null);
          }}
          onRefresh={refresh}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-ghost text-sm select-none">
          Select a note to read it
        </div>
      )}
    </div>
  );
}
