import { useState, useEffect, useCallback, useRef } from "react";
import { Note, TagEntry, View, ColorTheme } from "./types";
import { api } from "./api";
import Sidebar from "./components/Sidebar";
import Feed from "./components/Feed";
import NoteDetail from "./components/NoteDetail";

export default function App() {
  const [view, setView] = useState<View>("all");
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<TagEntry[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [focusNewNote, setFocusNewNote] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocusTrigger, setSearchFocusTrigger] = useState(0);
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

  const loadNotes = useCallback(async () => {
    try {
      let fetched: Note[];
      if (searchQuery.trim()) {
        fetched = await api.searchNotes(searchQuery);
      } else if (view === "all") {
        fetched = await api.listNotes();
      } else if (view === "inbox") {
        fetched = await api.getInbox();
      } else if (view === "trash") {
        fetched = await api.getTrash();
      } else if (typeof view === "object" && "tag" in view) {
        fetched = await api.getNotesByTag(view.tag);
      } else {
        fetched = [];
      }
      setNotes(fetched);
    } catch (e) {
      console.error("Failed to load notes:", e);
    }
  }, [view, searchQuery]);

  const loadSidebar = useCallback(async () => {
    try {
      const [allTags, inbox, recent] = await Promise.all([
        api.getAllTags(),
        api.getInbox(),
        api.getRecentNotes(),
      ]);
      setTags(allTags);
      setInboxCount(inbox.length);
      setRecentNotes(recent);
    } catch (e) {
      console.error("Failed to load sidebar:", e);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);
  useEffect(() => {
    loadSidebar();
  }, [loadSidebar]);

  const refresh = useCallback(() => {
    loadNotes();
    loadSidebar();
  }, [loadNotes, loadSidebar]);

  const handleAddNote = useCallback(async () => {
    try {
      const id = await api.insertNote("New note", "", []);
      setView("inbox");
      setSearchQuery("");
      await loadNotes();
      await loadSidebar();
      setFocusNewNote(true);
      setSelectedNoteId(id);
    } catch (e) {
      console.error("Failed to create note:", e);
    }
  }, [loadNotes, loadSidebar]);

  // Stale-closure-safe refs for global shortcuts
  const stateRef = useRef({ selectedNoteId, notes, view });
  useEffect(() => {
    stateRef.current = { selectedNoteId, notes, view };
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
            .catch(console.error);
        }
        return;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleAddNote, refresh]);

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
        inboxCount={inboxCount}
        theme={theme}
        colorTheme={colorTheme}
        onViewChange={handleViewChange}
        onTagRename={refresh}
        onTagDelete={refresh}
        recentNotes={recentNotes}
        onSelectNote={setSelectedNoteId}
        onThemeToggle={toggleTheme}
        onColorThemeChange={setColorTheme}
        onDbPathChange={refresh}
      />

      <Feed
        notes={notes}
        view={view}
        searchQuery={searchQuery}
        selectedNoteId={selectedNoteId}
        searchFocusTrigger={searchFocusTrigger}
        onSearchChange={setSearchQuery}
        onSelectNote={setSelectedNoteId}
        onTagClick={(tag) => handleViewChange({ tag })}
        onAddNote={handleAddNote}
        onEmptyTrash={async () => {
          await api.emptyTrash();
          setSelectedNoteId(null);
          refresh();
        }}
      />

      {selectedNoteId != null ? (
        <NoteDetail
          key={selectedNoteId}
          noteId={selectedNoteId}
          focusTitle={focusNewNote}
          onNavigate={(id) => {
            setFocusNewNote(false);
            setSelectedNoteId(id);
          }}
          onTagClick={(tag) => handleViewChange({ tag })}
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
