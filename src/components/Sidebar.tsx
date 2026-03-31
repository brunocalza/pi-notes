import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import { useToast } from "../hooks/useToast";
import {
  Inbox,
  FileText,
  Trash2,
  Tag,
  Pencil,
  X,
  Search,
  Sun,
  Moon,
  Settings,
  ChevronLeft,
  ChevronRight,
  Calendar,
  FolderOpen,
  Plus,
} from "lucide-react";
import { Collection, TagEntry, View, ColorTheme } from "../types";

interface Props {
  view: View;
  tags: TagEntry[];
  collections: Collection[];
  inboxCount: number;
  theme: "dark" | "light";
  colorTheme: ColorTheme;
  refreshKey: number;
  onViewChange: (v: View) => void;
  onTagRename: () => void;
  onTagDelete: () => void;
  onCollectionClick: (id: string) => void;
  onCreateCollection: (name: string) => Promise<void>;
  onRenameCollection: (id: string, newName: string) => Promise<void>;
  onDeleteCollection: (id: string) => void;
  onThemeToggle: () => void;
  onColorThemeChange: (t: ColorTheme) => void;
  onDbPathChange: () => void;
}

const THEMES: Array<{
  id: ColorTheme;
  label: string;
  dark: { bg: string; accent: string };
  light: { bg: string; accent: string };
}> = [
  {
    id: "graphite",
    label: "Graphite",
    dark: { bg: "#161b22", accent: "#4493f8" },
    light: { bg: "#f6f8fa", accent: "#0969da" },
  },
  {
    id: "ink",
    label: "Ink",
    dark: { bg: "#181209", accent: "#d4973f" },
    light: { bg: "#faf8f4", accent: "#a06820" },
  },
  {
    id: "nord",
    label: "Nord",
    dark: { bg: "#242933", accent: "#88c0d0" },
    light: { bg: "#eceff4", accent: "#5e81ac" },
  },
  {
    id: "dusk",
    label: "Dusk",
    dark: { bg: "#1f1d2e", accent: "#c4a7e7" },
    light: { bg: "#fffaf3", accent: "#907aa9" },
  },
  {
    id: "forest",
    label: "Forest",
    dark: { bg: "#141e1a", accent: "#4ade80" },
    light: { bg: "#f0f7f2", accent: "#16a34a" },
  },
];

export default function Sidebar({
  view,
  tags,
  collections,
  inboxCount,
  theme,
  colorTheme,
  refreshKey,
  onViewChange,
  onTagRename,
  onTagDelete,
  onCollectionClick,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onThemeToggle,
  onColorThemeChange,
  onDbPathChange,
}: Props) {
  const { error: toastError } = useToast();
  const [tagSearch, setTagSearch] = useState("");
  const [renameTag, setRenameTag] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dbPath, setDbPath] = useState("");
  const [dbPathInput, setDbPathInput] = useState("");
  const [dbPathError, setDbPathError] = useState("");

  // Collection state
  const [hoveredCollection, setHoveredCollection] = useState<string | null>(null);
  const [renameCollection, setRenameCollection] = useState<string | null>(null);
  const [renameCollectionValue, setRenameCollectionValue] = useState("");
  const [renameCollectionError, setRenameCollectionError] = useState<string | null>(null);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [createCollectionError, setCreateCollectionError] = useState<string | null>(null);
  const newCollectionInputRef = useRef<HTMLInputElement>(null);
  const renameCollectionInputRef = useRef<HTMLInputElement>(null);

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [daysWithNotes, setDaysWithNotes] = useState<Set<string>>(new Set());

  useEffect(() => {
    setDaysWithNotes(new Set());
    const prevDate = new Date(calYear, calMonth - 1, 1);
    const nextDate = new Date(calYear, calMonth + 1, 1);
    const months = [
      `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`,
      `${calYear}-${String(calMonth + 1).padStart(2, "0")}`,
      `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`,
    ];
    Promise.all(months.map((m) => api.getDaysWithNotesInMonth(m).catch(() => [] as number[])))
      .then(([prevDays, curDays, nextDays]) => {
        const dates = new Set<string>();
        prevDays.forEach((d) => dates.add(`${months[0]}-${String(d).padStart(2, "0")}`));
        curDays.forEach((d) => dates.add(`${months[1]}-${String(d).padStart(2, "0")}`));
        nextDays.forEach((d) => dates.add(`${months[2]}-${String(d).padStart(2, "0")}`));
        setDaysWithNotes(dates);
      })
      .catch(() => {});
  }, [calYear, calMonth, refreshKey]);

  useEffect(() => {
    if (settingsOpen) {
      api
        .getDbPathSetting()
        .then((p) => {
          setDbPath(p);
          setDbPathInput(p);
          setDbPathError("");
        })
        .catch((e) => toastError(`Failed to load settings: ${String(e)}`));
    }
  }, [settingsOpen, toastError]);

  const handleDbPathSave = async () => {
    if (dbPathInput === dbPath) return;
    try {
      await api.setDbPathSetting(dbPathInput);
      setDbPath(dbPathInput);
      setDbPathError("");
      onDbPathChange();
    } catch (e) {
      setDbPathError(String(e));
    }
  };

  const isActive = (v: View) => {
    if (typeof v === "string" && typeof view === "string") return view === v;
    if (typeof v === "object" && "tag" in v && typeof view === "object" && "tag" in view) {
      return view.tag === v.tag;
    }
    if (typeof v === "object" && "date" in v && typeof view === "object" && "date" in view) {
      return view.date === v.date;
    }
    if (
      typeof v === "object" &&
      "collection" in v &&
      typeof view === "object" &&
      "collection" in view
    ) {
      return view.collection === v.collection;
    }
    return false;
  };

  const handleCreateCollectionSubmit = async () => {
    const name = newCollectionName.trim();
    if (!name) {
      setCreatingCollection(false);
      setNewCollectionName("");
      setCreateCollectionError(null);
      return;
    }
    try {
      await onCreateCollection(name);
      setCreatingCollection(false);
      setNewCollectionName("");
      setCreateCollectionError(null);
    } catch (e) {
      setCreateCollectionError(String(e));
      setTimeout(() => newCollectionInputRef.current?.focus(), 0);
    }
  };

  const handleRenameCollectionSubmit = async (id: string) => {
    const name = renameCollectionValue.trim();
    const original = collections.find((c) => c.id === id)?.name ?? "";
    if (!name || name === original) {
      setRenameCollection(null);
      setRenameCollectionError(null);
      return;
    }
    try {
      await onRenameCollection(id, name);
      setRenameCollection(null);
      setRenameCollectionError(null);
    } catch (e) {
      setRenameCollectionError(String(e));
      setTimeout(() => renameCollectionInputRef.current?.focus(), 0);
    }
  };

  const navClass = (v: View) =>
    `flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm cursor-pointer transition-colors ${
      isActive(v) ? "bg-raised text-hi" : "text-lo hover:text-md hover:bg-field"
    }`;

  const filteredTags = tags.filter(([t]) => t.toLowerCase().includes(tagSearch.toLowerCase()));

  const handleRenameSubmit = async (oldTag: string) => {
    if (!renameValue.trim() || renameValue.trim() === oldTag) {
      setRenameTag(null);
      return;
    }
    try {
      await api.renameTag(oldTag, renameValue.trim());
      onTagRename();
    } catch (e) {
      toastError(`Failed to rename tag: ${String(e)}`);
    }
    setRenameTag(null);
  };

  const handleDeleteTag = async (tag: string) => {
    try {
      await api.deleteTag(tag);
      onTagDelete();
    } catch (e) {
      toastError(`Failed to delete tag: ${String(e)}`);
    }
  };

  return (
    <div
      className="flex flex-col shrink-0 border-r bc-ui bg-panel"
      style={{ width: 260, height: "100%" }}
    >
      {/* Header */}
      <div className="px-4 py-5 shrink-0">
        <span className="text-ghost text-xs font-semibold uppercase tracking-wider">Pi Notes</span>
      </div>

      {/* Nav */}
      <nav className="px-2 flex flex-col gap-0.5 shrink-0">
        <div className={navClass("inbox")} onClick={() => onViewChange("inbox")}>
          <Inbox size={15} />
          <span className="flex-1">Inbox</span>
          {inboxCount > 0 && (
            <span className="text-xs bg-inbox-badge text-inbox-badge px-1.5 py-0.5 rounded-full">
              {inboxCount}
            </span>
          )}
        </div>

        <div className={navClass("all")} onClick={() => onViewChange("all")}>
          <FileText size={15} />
          <span>My Notes</span>
        </div>

        <div className={navClass("trash")} onClick={() => onViewChange("trash")}>
          <Trash2 size={15} />
          <span>Trash</span>
        </div>
      </nav>

      {/* Collections */}
      <div className="px-3 mt-6 shrink-0">
        <div className="flex items-center gap-2 mb-1.5">
          <FolderOpen size={13} className="text-ghost shrink-0" />
          <span className="text-ghost text-xs font-semibold uppercase tracking-wider flex-1">
            Collections
          </span>
          <button
            onClick={() => {
              setCreatingCollection(true);
              setNewCollectionName("");
              setTimeout(() => newCollectionInputRef.current?.focus(), 0);
            }}
            className="p-0.5 rounded hover:bg-lift text-ghost hover:text-lo transition-colors"
            title="New collection"
          >
            <Plus size={12} />
          </button>
        </div>

        <div className="flex flex-col gap-0.5" style={{ maxHeight: 160, overflowY: "auto" }}>
          {collections.map((col) => (
            <div
              key={col.id}
              className="relative"
              onMouseEnter={() => setHoveredCollection(col.id)}
              onMouseLeave={() => setHoveredCollection(null)}
            >
              {renameCollection === col.id ? (
                <div className="px-2 py-1.5">
                  <input
                    ref={renameCollectionInputRef}
                    autoFocus
                    value={renameCollectionValue}
                    onChange={(e) => {
                      setRenameCollectionValue(e.target.value);
                      setRenameCollectionError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameCollectionSubmit(col.id);
                      if (e.key === "Escape") {
                        setRenameCollection(null);
                        setRenameCollectionError(null);
                      }
                    }}
                    onBlur={() => handleRenameCollectionSubmit(col.id)}
                    className={`w-full bg-lift border rounded px-1.5 py-0.5 text-xs text-hi outline-none ${renameCollectionError ? "border-red-500" : "bc-focus"}`}
                  />
                  {renameCollectionError && (
                    <p className="text-[10px] text-red-400 mt-0.5">{renameCollectionError}</p>
                  )}
                </div>
              ) : (
                <div
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                    isActive({ collection: col.id })
                      ? "bg-raised text-md"
                      : "text-dim hover:text-lo hover:bg-field"
                  }`}
                  onClick={() => onCollectionClick(col.id)}
                >
                  <span className="flex-1 truncate">{col.name}</span>
                  <span className="text-ghost">{col.note_count}</span>
                  {hoveredCollection === col.id && (
                    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setRenameCollection(col.id);
                          setRenameCollectionValue(col.name);
                        }}
                        className="p-0.5 rounded hover:bg-raised text-ghost hover:text-lo transition-colors"
                        title="Rename collection"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => onDeleteCollection(col.id)}
                        className="p-0.5 rounded hover:bg-danger text-ghost hover:text-danger transition-colors"
                        title="Delete collection"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {creatingCollection && (
            <div className="px-2 py-1.5">
              <input
                ref={newCollectionInputRef}
                value={newCollectionName}
                onChange={(e) => {
                  setNewCollectionName(e.target.value);
                  setCreateCollectionError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCollectionSubmit();
                  if (e.key === "Escape") {
                    setCreatingCollection(false);
                    setNewCollectionName("");
                    setCreateCollectionError(null);
                  }
                }}
                onBlur={handleCreateCollectionSubmit}
                placeholder="Collection name..."
                className={`w-full bg-lift border rounded px-1.5 py-0.5 text-xs text-hi outline-none placeholder-[#555] ${createCollectionError ? "border-red-500" : "bc-focus"}`}
              />
              {createCollectionError && (
                <p className="text-[10px] text-red-400 mt-0.5">{createCollectionError}</p>
              )}
            </div>
          )}

          {collections.length === 0 && !creatingCollection && (
            <p className="text-ghost text-xs px-2 py-1">No collections yet</p>
          )}
        </div>
      </div>

      {/* Calendar widget */}
      {(() => {
        const WEEKDAYS_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
        const MONTHS_SHORT = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];
        const firstDay = new Date(calYear, calMonth, 1).getDay();
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        const prevDays = new Date(calYear, calMonth, 0).getDate();
        const prevMonthDate = new Date(calYear, calMonth - 1, 1);
        const nextMonthDate = new Date(calYear, calMonth + 1, 1);
        const cells: Array<{ day: number; cur: boolean; year: number; month: number }> = [];
        for (let i = firstDay - 1; i >= 0; i--)
          cells.push({
            day: prevDays - i,
            cur: false,
            year: prevMonthDate.getFullYear(),
            month: prevMonthDate.getMonth(),
          });
        for (let d = 1; d <= daysInMonth; d++)
          cells.push({ day: d, cur: true, year: calYear, month: calMonth });
        while (cells.length % 7 !== 0)
          cells.push({
            day: cells.length - daysInMonth - firstDay + 1,
            cur: false,
            year: nextMonthDate.getFullYear(),
            month: nextMonthDate.getMonth(),
          });

        const isToday = (d: number) =>
          d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
        const isActiveDate = (d: number) => {
          const mm = String(calMonth + 1).padStart(2, "0");
          const dd = String(d).padStart(2, "0");
          return isActive({ date: `${calYear}-${mm}-${dd}` });
        };

        return (
          <div className="px-3 mt-6 shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <Calendar size={13} className="text-ghost shrink-0" />
              <span className="text-ghost text-xs font-semibold uppercase tracking-wider flex-1">
                Calendar
              </span>
            </div>
            <div className="flex items-center gap-1 mb-2">
              <button
                onClick={() => {
                  setCalMonth(today.getMonth());
                  setCalYear(today.getFullYear());
                }}
                className={`text-xs flex-1 text-left transition-colors ${calMonth !== today.getMonth() || calYear !== today.getFullYear() ? "text-dim hover:text-lo cursor-pointer" : "text-dim cursor-default"}`}
                title="Go to today"
              >
                {MONTHS_SHORT[calMonth]} {calYear}
              </button>
              <button
                onClick={() => {
                  if (calMonth === 0) {
                    setCalMonth(11);
                    setCalYear((y) => y - 1);
                  } else setCalMonth((m) => m - 1);
                }}
                className="p-0.5 rounded hover:bg-lift text-ghost hover:text-lo transition-colors"
                title="Previous month"
              >
                <ChevronLeft size={12} />
              </button>
              <button
                onClick={() => {
                  if (calMonth === 11) {
                    setCalMonth(0);
                    setCalYear((y) => y + 1);
                  } else setCalMonth((m) => m + 1);
                }}
                className="p-0.5 rounded hover:bg-lift text-ghost hover:text-lo transition-colors"
                title="Next month"
              >
                <ChevronRight size={12} />
              </button>
            </div>

            <div className="grid grid-cols-7 mb-0.5">
              {WEEKDAYS_SHORT.map((wd) => (
                <div key={wd} className="text-center text-[9px] text-ghost font-medium py-0.5">
                  {wd}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {cells.map((cell, idx) => {
                const cellDate = `${cell.year}-${String(cell.month + 1).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
                const hasDot = daysWithNotes.has(cellDate);
                const active = cell.cur && isActiveDate(cell.day);
                const todayCell = cell.cur && isToday(cell.day);
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      if (!cell.cur) return;
                      const mm = String(calMonth + 1).padStart(2, "0");
                      const dd = String(cell.day).padStart(2, "0");
                      onViewChange({ date: `${calYear}-${mm}-${dd}` });
                    }}
                    className={`flex items-center justify-center py-0.5 rounded transition-colors ${
                      !cell.cur
                        ? "cursor-default"
                        : active
                          ? "bg-raised cursor-pointer"
                          : "hover:bg-field cursor-pointer"
                    }`}
                  >
                    <span
                      className={`text-[10px] leading-none inline-flex items-center justify-center w-[18px] h-[18px] rounded-sm border ${
                        !cell.cur
                          ? hasDot
                            ? "text-ghost border-[var(--c-text-ghost)]"
                            : "text-ghost border-transparent"
                          : active
                            ? "text-hi font-semibold border-transparent"
                            : hasDot
                              ? todayCell
                                ? "text-accent font-semibold border-[var(--c-accent)]"
                                : "text-dim border-[var(--c-text-dim)]"
                              : todayCell
                                ? "text-accent font-semibold border-transparent"
                                : "text-dim border-transparent"
                      }`}
                    >
                      {cell.day}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Tags — flex-1, scroll only on list below search */}
      <div className="flex-1 min-h-0 flex flex-col mt-6 px-3">
        <div className="flex items-center gap-2 mb-2 shrink-0 px-1">
          <Tag size={13} className="text-ghost shrink-0" />
          <span className="text-ghost text-xs font-semibold uppercase tracking-wider">Tags</span>
        </div>

        {tags.length > 5 && (
          <div className="relative mb-2 shrink-0">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-ghost" />
            <input
              type="text"
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              placeholder="Filter tags..."
              className="w-full bg-field border bc-ui rounded text-xs pl-6 pr-2 py-1 text-lo placeholder-[#444] outline-none focus:bc-focus"
            />
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 pb-2">
          {filteredTags.map(([tag, count]) => (
            <div
              key={tag}
              className="relative"
              onMouseEnter={() => setHoveredTag(tag)}
              onMouseLeave={() => setHoveredTag(null)}
            >
              {renameTag === tag ? (
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSubmit(tag);
                      if (e.key === "Escape") setRenameTag(null);
                    }}
                    onBlur={() => handleRenameSubmit(tag)}
                    className="flex-1 bg-lift border bc-focus rounded px-1.5 py-0.5 text-xs text-hi outline-none"
                  />
                </div>
              ) : (
                <div
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                    isActive({ tag })
                      ? "bg-raised text-md"
                      : "text-dim hover:text-lo hover:bg-field"
                  }`}
                  onClick={() => onViewChange({ tag })}
                >
                  <span className="text-ghost">#</span>
                  <span className="flex-1 truncate">{tag}</span>
                  <span className="text-ghost">{count}</span>

                  {hoveredTag === tag && (
                    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setRenameTag(tag);
                          setRenameValue(tag);
                        }}
                        className="p-0.5 rounded hover:bg-raised text-ghost hover:text-lo transition-colors"
                        title="Rename tag"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={() => handleDeleteTag(tag)}
                        className="p-0.5 rounded hover:bg-danger text-ghost hover:text-danger transition-colors"
                        title="Delete tag"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {filteredTags.length === 0 && tagSearch && (
            <p className="text-ghost text-xs px-2 py-1">No matching tags</p>
          )}
          {tags.length === 0 && !tagSearch && (
            <p className="text-ghost text-xs px-2 py-1">No tags yet</p>
          )}
        </div>
      </div>
      {/* end Tags */}

      {/* Settings panel */}
      {settingsOpen && (
        <div className="border-t bc-subtle px-4 py-4 shrink-0">
          <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider mb-3">
            Appearance
          </p>

          {/* Theme swatches */}
          <div className="flex gap-2 mb-4">
            {THEMES.map((t) => {
              const colors = theme === "dark" ? t.dark : t.light;
              const selected = colorTheme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => onColorThemeChange(t.id)}
                  className="flex flex-col items-center gap-1.5 group"
                  title={t.label}
                >
                  <div
                    className="rounded transition-transform group-hover:scale-110"
                    style={{
                      width: 34,
                      height: 26,
                      background: colors.bg,
                      border: selected ? `2px solid ${colors.accent}` : "2px solid transparent",
                      boxShadow: selected ? `0 0 0 1px ${colors.accent}40` : "none",
                      borderRadius: 5,
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 6,
                        background: colors.accent,
                      }}
                    />
                  </div>
                  <span
                    className="text-[9px] transition-colors"
                    style={{ color: selected ? colors.accent : "var(--c-text-ghost)" }}
                  >
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Dark / Light toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-ghost">Mode</span>
            <div className="flex items-center gap-1 bg-field border bc-ui rounded-md p-0.5">
              <button
                onClick={() => theme === "light" && onThemeToggle()}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                  theme === "dark" ? "bg-raised text-md" : "text-dim hover:text-lo"
                }`}
              >
                <Moon size={11} />
                Dark
              </button>
              <button
                onClick={() => theme === "dark" && onThemeToggle()}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                  theme === "light" ? "bg-raised text-md" : "text-dim hover:text-lo"
                }`}
              >
                <Sun size={11} />
                Light
              </button>
            </div>
          </div>

          {/* Storage */}
          <div className="border-t bc-subtle mt-4 pt-4">
            <p className="text-[10px] font-semibold text-ghost uppercase tracking-wider mb-2">
              Storage
            </p>
            <p className="text-[10px] text-ghost mb-1">Database path</p>
            <input
              value={dbPathInput}
              onChange={(e) => {
                setDbPathInput(e.target.value);
                setDbPathError("");
              }}
              onBlur={handleDbPathSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                }
              }}
              spellCheck={false}
              className="w-full bg-field border bc-ui rounded px-2 py-1 text-[11px] text-lo outline-none focus:bc-focus font-mono"
            />
            {dbPathError && <p className="text-[10px] text-danger mt-1 break-all">{dbPathError}</p>}
          </div>
        </div>
      )}

      {/* Settings button */}
      <div className="border-t bc-subtle px-3 py-2 shrink-0">
        <button
          onClick={() => setSettingsOpen((o) => !o)}
          className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs transition-colors ${
            settingsOpen ? "bg-raised text-md" : "text-lo hover:text-md hover:bg-field"
          }`}
        >
          <Settings size={13} />
          Settings
        </button>
      </div>
    </div>
  );
}
