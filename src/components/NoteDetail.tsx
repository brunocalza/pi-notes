import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Trash2, Link, Plus, X } from "lucide-react";
import { Note, TagEntry } from "../types";
import BlockEditor from "./BlockEditor";
import { validateTag } from "../tags";


interface Props {
  noteId: number;
  focusTitle?: boolean;
  onNavigate: (id: number) => void;
  onTagClick: (tag: string) => void;
  onDeselect: () => void;
  onRefresh: () => void;
}

export default function NoteDetail({ noteId, focusTitle, onNavigate, onTagClick, onDeselect, onRefresh }: Props) {
  const [note, setNote] = useState<Note | null>(null);
  const [backlinks, setBacklinks] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const [allTagsList, setAllTagsList] = useState<string[]>([]);
  const [tagInputOpen, setTagInputOpen] = useState(false);
  const [tagInputValue, setTagInputValue] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [tagActiveIdx, setTagActiveIdx] = useState(0);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagPopoverRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    invoke<Note | null>("get_note", { id: noteId }).then((n) => {
      if (n) { setNote(n); setTitle(n.title); setTags(n.tags); }
    }).catch(console.error);
    invoke<Note[]>("get_backlinks", { id: noteId }).then(setBacklinks).catch(console.error);
  }, [noteId]);

  useEffect(() => {
    if (focusTitle && note && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
    }
  }, [focusTitle, note]);

  useEffect(() => {
    invoke<TagEntry[]>("get_all_tags")
      .then((entries) => setAllTagsList(entries.map(([t]) => t)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tagInputOpen) setTimeout(() => tagInputRef.current?.focus(), 0);
    else { setTagInputValue(""); setTagSuggestions([]); }
  }, [tagInputOpen]);

  // Close tag input on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const outsideInput = !tagInputRef.current?.contains(e.target as Node);
      const outsidePopover = !tagPopoverRef.current?.contains(e.target as Node);
      if (outsideInput && outsidePopover) setTagInputOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const save = async (newTitle: string, newContent: string, newTags: string[]) => {
    if (!note) return;
    try {
      await invoke("update_note", { id: note.id, title: newTitle.trim() || note.title, content: newContent, tags: newTags });
      onRefresh();
    } catch (e) { console.error("Failed to save note:", e); }
  };

  const handleTagInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setTagInputValue(v);
    setTagActiveIdx(0);
    const { normalized } = validateTag(v);
    setTagSuggestions(
      v.trim() ? allTagsList.filter((t) => t.startsWith(normalized) && !tags.includes(t)).slice(0, 8) : []
    );
  };

  const commitTag = (value: string) => {
    const { valid, normalized } = validateTag(value);
    if (valid && !tags.includes(normalized)) {
      const newTags = [...tags, normalized];
      setTags(newTags);
      save(title, note?.content ?? "", newTags);
    }
    setTagInputOpen(false);
  };

  const removeTag = (tag: string) => {
    const newTags = tags.filter((t) => t !== tag);
    setTags(newTags);
    save(title, note?.content ?? "", newTags);
  };

  const showCreate = tagInputValue.trim().length > 0 && !allTagsList.includes(validateTag(tagInputValue).normalized);
  const totalItems = tagSuggestions.length + (showCreate ? 1 : 0);

  if (!note) {
    return <div className="flex-1 flex items-center justify-center text-ghost text-sm">Loading...</div>;
  }

  const handleTrash = async () => {
    await invoke("trash_note", { id: note.id });
    onDeselect();
    onRefresh();
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b bc-subtle shrink-0">
        <div className="flex-1" />
        <button
          onClick={handleTrash}
          className="p-1.5 rounded text-ghost hover:text-red-400 hover:bg-lift transition-colors"
          title="Move to trash"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl mx-auto">
          {/* Inline title */}
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => save(title, note.content, tags)}
            placeholder="Untitled"
            className="w-full text-xl font-semibold text-hi bg-transparent outline-none mb-3 placeholder-ghost"
          />

          {/* Tags row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center text-xs bg-lift rounded-full px-2.5 py-0.5 group"
              >
                <span
                  onClick={() => onTagClick(tag)}
                  className="text-dim hover:text-lo cursor-pointer transition-colors select-none"
                >
                  #{tag}
                </span>
                <button
                  onClick={() => removeTag(tag)}
                  className="w-0 overflow-hidden group-hover:w-3 ml-0 group-hover:ml-1 transition-all duration-100 text-ghost hover:text-lo flex items-center shrink-0 cursor-pointer"
                  tabIndex={-1}
                >
                  <X size={9} />
                </button>
              </span>
            ))}

            {/* + button / inline input */}
            <div className="relative">
              {tagInputOpen ? (
                <>
                  <input
                    ref={tagInputRef}
                    value={tagInputValue}
                    onChange={handleTagInputChange}
                    onKeyDown={(e) => {
                      if (totalItems > 0) {
                        if (e.key === "ArrowDown") { e.preventDefault(); setTagActiveIdx((i) => (i + 1) % totalItems); return; }
                        if (e.key === "ArrowUp")   { e.preventDefault(); setTagActiveIdx((i) => (i - 1 + totalItems) % totalItems); return; }
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const isCreate = tagActiveIdx === tagSuggestions.length && showCreate;
                          commitTag(isCreate ? tagInputValue : tagSuggestions[tagActiveIdx]);
                          return;
                        }
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        commitTag(tagInputValue);
                        return;
                      }
                      if (e.key === "Escape") setTagInputOpen(false);
                    }}
                    placeholder="Search or create…"
                    className="bg-field border bc-focus rounded px-2 py-0.5 text-xs text-md outline-none w-36"
                  />
                  {totalItems > 0 && (
                    <div
                      ref={tagPopoverRef}
                      className="absolute left-0 top-full mt-1 bg-field border bc-ui rounded-md shadow-xl z-50 overflow-hidden min-w-36"
                    >
                      {tagSuggestions.map((t, i) => (
                        <button
                          key={t}
                          onMouseDown={(e) => { e.preventDefault(); commitTag(t); }}
                          onMouseEnter={() => setTagActiveIdx(i)}
                          className={`flex w-full px-3 py-1.5 text-xs text-left transition-colors ${tagActiveIdx === i ? "bg-raised text-hi" : "text-md hover:bg-lift"}`}
                        >
                          #{t}
                        </button>
                      ))}
                      {showCreate && (
                        <button
                          onMouseDown={(e) => { e.preventDefault(); commitTag(tagInputValue); }}
                          onMouseEnter={() => setTagActiveIdx(tagSuggestions.length)}
                          className={`flex w-full px-3 py-1.5 text-xs text-left transition-colors ${tagActiveIdx === tagSuggestions.length ? "bg-raised text-hi" : "text-dim hover:bg-lift"}`}
                        >
                          Create &ldquo;{validateTag(tagInputValue).normalized}&rdquo;
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : tags.length === 0 ? (
                <button
                  onClick={() => setTagInputOpen(true)}
                  className="flex items-center gap-1 text-xs text-ghost hover:text-lo transition-colors"
                >
                  <Plus size={11} />
                  Add tag
                </button>
              ) : (
                <button
                  onClick={() => setTagInputOpen(true)}
                  className="flex items-center justify-center w-5 h-5 rounded text-ghost hover:text-lo hover:bg-field transition-colors"
                  title="Add tag"
                >
                  <Plus size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Block editor */}
          <BlockEditor
            content={note.content}
            onCommit={(newContent) => {
              setNote({ ...note, content: newContent });
              save(title, newContent, tags);
            }}
            onNavigate={onNavigate}
          />

          {note.image_path && (
            <div className="mt-6">
              <img src={`file://${note.image_path}`} alt="Note attachment" className="max-w-full rounded-lg border bc-strong" />
            </div>
          )}

          {backlinks.length > 0 && (
            <div className="mt-8 pt-4 border-t bc-subtle">
              <div className="flex items-center gap-1.5 mb-2">
                <Link size={12} className="text-ghost" />
                <span className="text-xs font-semibold text-ghost uppercase tracking-wider">Linked by</span>
              </div>
              <div className="flex flex-col items-start gap-1">
                {backlinks.map((bl) => (
                  <button
                    key={bl.id}
                    onClick={() => onNavigate(bl.id)}
                    className="text-left text-xs text-accent px-2 py-1 rounded hover:bg-field transition-colors max-w-full truncate cursor-pointer"
                  >
                    {bl.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 pt-4 border-t bc-subtle">
            <p className="text-xs text-ghost">
              Created {new Date(note.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
              Updated {new Date(note.updated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
