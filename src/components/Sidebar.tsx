import { useState, useEffect } from "react";
import { api } from "../api";
import { Inbox, FileText, Trash2, Tag, Pencil, X, Search, Sun, Moon, Settings } from "lucide-react";
import { TagEntry, View, ColorTheme } from "../types";

interface Props {
  view: View;
  tags: TagEntry[];
  inboxCount: number;
  theme: "dark" | "light";
  colorTheme: ColorTheme;
  onViewChange: (v: View) => void;
  onTagRename: () => void;
  onTagDelete: () => void;
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
  inboxCount,
  theme,
  colorTheme,
  onViewChange,
  onTagRename,
  onTagDelete,
  onThemeToggle,
  onColorThemeChange,
  onDbPathChange,
}: Props) {
  const [tagSearch, setTagSearch] = useState("");
  const [renameTag, setRenameTag] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [hoveredTag, setHoveredTag] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dbPath, setDbPath] = useState("");
  const [dbPathInput, setDbPathInput] = useState("");
  const [dbPathError, setDbPathError] = useState("");

  useEffect(() => {
    if (settingsOpen) {
      api
        .getDbPathSetting()
        .then((p) => {
          setDbPath(p);
          setDbPathInput(p);
          setDbPathError("");
        })
        .catch(console.error);
    }
  }, [settingsOpen]);

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
    return false;
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
      console.error(e);
    }
    setRenameTag(null);
  };

  const handleDeleteTag = async (tag: string) => {
    try {
      await api.deleteTag(tag);
      onTagDelete();
    } catch (e) {
      console.error(e);
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

      {/* Tags — scrollable */}
      <div className="flex-1 min-h-0 overflow-y-auto mt-6 px-4">
        <div className="flex items-center gap-2 mb-2">
          <Tag size={13} className="text-ghost" />
          <span className="text-ghost text-xs font-semibold uppercase tracking-wider">Tags</span>
        </div>

        {tags.length > 5 && (
          <div className="relative mb-2">
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

        <div className="flex flex-col gap-0.5 pb-2">
          {filteredTags.map(([tag, count]) => (
            <div
              key={tag}
              className="relative"
              onMouseEnter={() => setHoveredTag(tag)}
              onMouseLeave={() => setHoveredTag(null)}
            >
              {renameTag === tag ? (
                <div className="flex items-center gap-1 px-2 py-1">
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
                  className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-xs transition-colors ${
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
