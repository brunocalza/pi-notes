import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Tag } from "lucide-react";
import TagInput from "./TagInput";
import ContentEditor from "./ContentEditor";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function AddNotePanel({ onClose, onSaved }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    try {
      await invoke("insert_note", { title: title.trim(), content, tags });
      onSaved();
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-surface border bc-ui rounded-xl shadow-2xl w-full max-w-xl mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bc-subtle">
          <h2 className="text-sm font-semibold text-md">New Note</h2>
          <button onClick={onClose} className="text-ghost hover:text-lo transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          <div>
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(""); }}
              placeholder="Title"
              className="w-full bg-field border bc-ui rounded-md px-3 py-2 text-sm text-hi placeholder-[#444] outline-none focus:bc-focus transition-colors"
            />
            {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
          </div>

          <ContentEditor
            value={content}
            onChange={setContent}
            placeholder="Write your note in Markdown..."
            rows={12}
          />

          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tag size={13} className="text-ghost" />
              <span className="text-xs text-ghost">Tags</span>
            </div>
            <TagInput
              tags={tags}
              onAdd={(t) => setTags([...tags, t])}
              onRemove={(t) => setTags(tags.filter((x) => x !== t))}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t bc-subtle">
          <button onClick={onClose} className="px-4 py-1.5 text-xs text-dim hover:text-lo transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs bg-accent-btn hover:bg-accent-btn-hover text-accent rounded-md transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Note"}
          </button>
        </div>
      </div>
    </div>
  );
}
