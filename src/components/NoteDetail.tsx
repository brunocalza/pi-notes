import { useEffect, useState, useRef } from "react";
import {
  Trash2,
  Link,
  Plus,
  X,
  Paperclip,
  Pencil,
  Check,
  Undo2,
  MoreHorizontal,
} from "lucide-react";
import { api } from "../api";
import { Note, AttachmentMeta } from "../types";
import BlockEditor from "./BlockEditor";
import { validateTag } from "../tags";

interface Props {
  noteId: number;
  focusTitle?: boolean;
  onNavigate: (id: number) => void;
  onTagClick: (tag: string) => void;
  onDateSelect?: (date: string) => void;
  onDeselect: () => void;
  onRefresh: () => void;
}

export default function NoteDetail({
  noteId,
  focusTitle,
  onNavigate,
  onTagClick,
  onDateSelect,
  onDeselect,
  onRefresh,
}: Props) {
  const [note, setNote] = useState<Note | null>(null);
  const [backlinks, setBacklinks] = useState<Note[]>([]);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const [allTagsList, setAllTagsList] = useState<string[]>([]);
  const [tagInputOpen, setTagInputOpen] = useState(false);
  const [tagInputValue, setTagInputValue] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [tagActiveIdx, setTagActiveIdx] = useState(0);
  const [actionsOpen, setActionsOpen] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const tagPopoverRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const actionsButtonRef = useRef<HTMLButtonElement>(null);
  const actionsPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .getNote(noteId)
      .then((n) => {
        if (n) {
          setNote(n);
          setTitle(n.title);
          setTags(n.tags);
        }
      })
      .catch(console.error);
    api.getBacklinks(noteId).then(setBacklinks).catch(console.error);
    api.getAttachments(noteId).then(setAttachments).catch(console.error);
  }, [noteId]);

  useEffect(() => {
    if (focusTitle && note && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
    }
  }, [focusTitle, note]);

  useEffect(() => {
    api
      .getAllTags()
      .then((entries) => setAllTagsList(entries.map(([t]) => t)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tagInputOpen) setTimeout(() => tagInputRef.current?.focus(), 0);
    else {
      setTagInputValue("");
      setTagSuggestions([]);
    }
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

  // Close actions popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        !actionsButtonRef.current?.contains(e.target as Node) &&
        !actionsPopoverRef.current?.contains(e.target as Node)
      )
        setActionsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const save = async (newTitle: string, newContent: string, newTags: string[]) => {
    if (!note) return;
    try {
      await api.updateNote(note.id, newTitle.trim() || note.title, newContent, newTags);
      onRefresh();
    } catch (e) {
      console.error("Failed to save note:", e);
    }
  };

  const handleTagInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setTagInputValue(v);
    setTagActiveIdx(0);
    const { normalized } = validateTag(v);
    setTagSuggestions(
      v.trim()
        ? allTagsList.filter((t) => t.startsWith(normalized) && !tags.includes(t)).slice(0, 8)
        : []
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

  const showCreate =
    tagInputValue.trim().length > 0 && !allTagsList.includes(validateTag(tagInputValue).normalized);
  const totalItems = tagSuggestions.length + (showCreate ? 1 : 0);

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center text-ghost text-sm">Loading...</div>
    );
  }

  const handleAttachFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !note) return;
    e.target.value = "";
    const buffer = await file.arrayBuffer();
    const data = Array.from(new Uint8Array(buffer));
    try {
      const id = await api.addAttachment(note.id, file.name, file.type, data);
      const meta: AttachmentMeta = {
        id,
        note_id: note.id,
        filename: file.name,
        mime_type: file.type,
        size: file.size,
        created_at: new Date().toISOString(),
      };
      setAttachments((prev) => [...prev, meta]);
    } catch (e) {
      console.error("Failed to attach file:", e);
    }
  };

  const handleRenameAttachment = async (id: number, newFilename: string) => {
    const trimmed = newFilename.trim();
    const old = attachments.find((a) => a.id === id);
    setRenamingId(null);
    if (!trimmed || !old || trimmed === old.filename) return;
    try {
      await api.renameAttachment(id, trimmed);
      setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, filename: trimmed } : a)));
      if (note) {
        const newContent = note.content
          .split(`attachment:${old.filename}`)
          .join(`attachment:${trimmed}`);
        if (newContent !== note.content) {
          setNote({ ...note, content: newContent });
          await api.updateNote(note.id, title, newContent, tags);
          onRefresh();
        }
      }
    } catch (e) {
      console.error("Failed to rename attachment:", e);
    }
  };

  const handleDeleteAttachment = async (id: number) => {
    try {
      await api.deleteAttachment(id);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      console.error("Failed to delete attachment:", e);
    }
  };

  const missingForAccept = [
    ...(!title.trim() ? ["a title"] : []),
    ...(!note?.content.trim() ? ["some content"] : []),
  ];
  const canAccept = missingForAccept.length === 0;

  const handleAccept = async () => {
    if (!note || !canAccept) return;
    setActionsOpen(false);
    try {
      await api.acceptNote(note.id);
      onDeselect();
      onRefresh();
    } catch (e) {
      console.error("Failed to accept note:", e);
    }
  };

  const handleTrash = async () => {
    setActionsOpen(false);
    try {
      await api.trashNote(note.id);
      onDeselect();
      onRefresh();
    } catch (e) {
      console.error("Failed to trash note:", e);
    }
  };

  const handleDeletePermanently = async () => {
    setActionsOpen(false);
    if (!window.confirm("Permanently delete this note? This cannot be undone.")) return;
    try {
      await api.deleteNote(note.id);
      onDeselect();
      onRefresh();
    } catch (e) {
      console.error("Failed to delete note:", e);
    }
  };

  const handleMoveToInbox = async () => {
    setActionsOpen(false);
    try {
      await api.moveToInbox(note.id);
      onDeselect();
      onRefresh();
    } catch (e) {
      console.error("Failed to move note to inbox:", e);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl mx-auto">
          {/* Title row with actions popover */}
          <div className="flex items-center gap-2 mb-3">
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                if (title.trim() === note.title.trim()) return;
                save(title, note.content, tags);
              }}
              placeholder="Untitled"
              className="flex-1 text-xl font-semibold text-hi bg-transparent outline-none placeholder-ghost min-w-0"
            />
            <div className="relative shrink-0">
              <button
                ref={actionsButtonRef}
                onClick={() => setActionsOpen((o) => !o)}
                className="p-1 rounded text-ghost hover:text-lo hover:bg-lift transition-colors"
                title="Note actions"
              >
                <MoreHorizontal size={16} />
              </button>
              {actionsOpen && (
                <div
                  ref={actionsPopoverRef}
                  className="absolute right-0 top-full mt-1 bg-field border bc-ui rounded-md shadow-xl z-50 overflow-hidden min-w-44"
                >
                  {note.in_inbox && (
                    <button
                      onClick={handleAccept}
                      disabled={!canAccept}
                      title={canAccept ? undefined : `Needs: ${missingForAccept.join(", ")}`}
                      className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors ${
                        canAccept
                          ? "text-inbox-badge hover:bg-lift cursor-pointer"
                          : "text-ghost cursor-not-allowed"
                      }`}
                    >
                      <Check size={12} />
                      Accept note
                    </button>
                  )}
                  {note.trashed && (
                    <button
                      onClick={handleMoveToInbox}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left text-md hover:bg-lift transition-colors"
                    >
                      <Undo2 size={12} />
                      Move to inbox
                    </button>
                  )}
                  {(note.in_inbox || note.trashed) && <div className="border-t bc-ui my-1" />}
                  {note.trashed ? (
                    <button
                      onClick={handleDeletePermanently}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left text-danger hover:bg-lift transition-colors"
                    >
                      <Trash2 size={12} />
                      Delete permanently
                    </button>
                  ) : (
                    <button
                      onClick={handleTrash}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left text-danger hover:bg-lift transition-colors"
                    >
                      <Trash2 size={12} />
                      Move to trash
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tags + attachments — single inline row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-5">
            {/* Tag pills */}
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

            {/* Add tag button / inline input */}
            <div className="relative">
              {tagInputOpen ? (
                <>
                  <input
                    ref={tagInputRef}
                    value={tagInputValue}
                    onChange={handleTagInputChange}
                    onKeyDown={(e) => {
                      if (totalItems > 0) {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          setTagActiveIdx((i) => (i + 1) % totalItems);
                          return;
                        }
                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          setTagActiveIdx((i) => (i - 1 + totalItems) % totalItems);
                          return;
                        }
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
                          onMouseDown={(e) => {
                            e.preventDefault();
                            commitTag(t);
                          }}
                          onMouseEnter={() => setTagActiveIdx(i)}
                          className={`flex w-full px-3 py-1.5 text-xs text-left transition-colors ${tagActiveIdx === i ? "bg-raised text-hi" : "text-md hover:bg-lift"}`}
                        >
                          #{t}
                        </button>
                      ))}
                      {showCreate && (
                        <button
                          onMouseDown={(e) => {
                            e.preventDefault();
                            commitTag(tagInputValue);
                          }}
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

            {/* Divider */}
            <span className="text-ghost select-none">·</span>

            {/* Attachment chips */}
            {attachments.map((a) => (
              <span
                key={a.id}
                className="flex items-center text-xs bg-lift rounded-full px-2.5 py-0.5 group"
              >
                <Paperclip size={9} className="text-ghost mr-1 shrink-0" />
                {renamingId === a.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameAttachment(a.id, renameValue)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameAttachment(a.id, renameValue);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="bg-transparent outline-none text-dim w-32"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <button
                      onClick={() => api.openAttachment(a.id).catch(console.error)}
                      className="text-dim hover:text-lo transition-colors select-none truncate max-w-36"
                      title={a.filename}
                    >
                      {a.filename}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(a.id);
                        setRenameValue(a.filename);
                      }}
                      className="w-0 overflow-hidden group-hover:w-3 ml-0 group-hover:ml-1 transition-all duration-100 text-ghost hover:text-lo flex items-center shrink-0 cursor-pointer"
                      tabIndex={-1}
                      title="Rename"
                    >
                      <Pencil size={9} />
                    </button>
                  </>
                )}
                <button
                  onClick={() => handleDeleteAttachment(a.id)}
                  className="w-0 overflow-hidden group-hover:w-3 ml-0 group-hover:ml-1 transition-all duration-100 text-ghost hover:text-lo flex items-center shrink-0 cursor-pointer"
                  tabIndex={-1}
                >
                  <X size={9} />
                </button>
              </span>
            ))}

            {/* Attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-xs text-ghost hover:text-lo transition-colors"
            >
              <Paperclip size={11} />
              {attachments.length === 0 && <span>Attach</span>}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleAttachFile}
            />
          </div>

          {/* Block editor */}
          <div className="bg-lift rounded-lg px-4 py-3">
            <BlockEditor
              content={note.content}
              onCommit={(newContent) => {
                setNote({ ...note, content: newContent });
                save(title, newContent, tags);
              }}
              onNavigate={onNavigate}
              onDateSelect={onDateSelect}
              attachments={attachments}
            />
          </div>

          {backlinks.length > 0 && (
            <div className="mt-8 pt-4 border-t bc-subtle">
              <div className="flex items-center gap-1.5 mb-2">
                <Link size={12} className="text-ghost" />
                <span className="text-xs font-semibold text-ghost uppercase tracking-wider">
                  Linked by
                </span>
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
              Created{" "}
              {new Date(note.created_at).toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })}{" "}
              · Updated{" "}
              {new Date(note.updated_at).toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
