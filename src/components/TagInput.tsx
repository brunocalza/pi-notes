import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../api";
import { X, Hash } from "lucide-react";
import { validateTag } from "../tags";

interface Props {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}

export default function TagInput({ tags, onAdd, onRemove }: Props) {
  const [input, setInput] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Load all existing tags once
  useEffect(() => {
    api
      .getAllTags()
      .then((entries) => setAllTags(entries.map(([t]) => t)))
      .catch(() => {});
  }, []);

  const normalized = validateTag(input).normalized;

  // Prefix-match existing tags, excluding already selected ones
  const suggestions = input.trim()
    ? allTags.filter((t) => t.startsWith(normalized) && !tags.includes(t))
    : [];

  // "Create new" only when the normalized value doesn't already exist in the tag library
  const showCreate =
    input.trim().length > 0 && !tags.includes(normalized) && !allTags.includes(normalized);

  const totalItems = suggestions.length + (showCreate ? 1 : 0);
  const createIndex = suggestions.length; // last item

  const commit = useCallback(
    (value: string) => {
      const result = validateTag(value);
      if (!result.valid) {
        setError(result.errors[0]);
        return;
      }
      if (!tags.includes(result.normalized)) {
        onAdd(result.normalized);
      }
      setInput("");
      setError("");
      setOpen(false);
      setActiveIndex(0);
    },
    [tags, onAdd]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || totalItems === 0) {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        commit(input);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % totalItems);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + totalItems) % totalItems);
    } else if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (activeIndex === createIndex && showCreate) {
        commit(input);
      } else {
        commit(suggestions[activeIndex]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Close popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    setError("");
    setActiveIndex(0);
    setOpen(true);
  };

  return (
    <div>
      {/* Selected tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1 text-xs bg-lift border bc-ui text-lo rounded-full px-2 py-0.5"
            >
              #{tag}
              <button onClick={() => onRemove(tag)} className="text-ghost hover:text-lo ml-0.5">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input + popover */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => input.trim() && setOpen(true)}
          placeholder="Add tag..."
          className={`w-full bg-field border rounded px-3 py-1.5 text-xs text-md placeholder-[var(--c-text-ghost)] outline-none transition-colors ${
            error ? "bc-danger" : "bc-ui focus:bc-focus"
          }`}
        />

        {error && <p className="text-danger text-[10px] mt-1">{error}</p>}

        {/* Popover */}
        {open && totalItems > 0 && (
          <div
            ref={popoverRef}
            role="listbox"
            className="absolute left-0 right-0 bottom-full mb-1 bg-field border bc-ui rounded-md shadow-xl z-50 overflow-hidden animate-popover"
          >
            {suggestions.map((tag, i) => (
              <button
                key={tag}
                role="option"
                aria-selected={activeIndex === i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(tag);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors ${
                  activeIndex === i ? "bg-raised text-md" : "text-dim hover:bg-lift"
                }`}
              >
                <Hash size={11} className="text-ghost shrink-0" />
                <span>
                  <span className="text-lo">{tag.slice(0, normalized.length)}</span>
                  <span>{tag.slice(normalized.length)}</span>
                </span>
              </button>
            ))}

            {showCreate && (
              <>
                {suggestions.length > 0 && <div className="border-t bc-ui" />}
                <button
                  role="option"
                  aria-selected={activeIndex === createIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(input);
                  }}
                  onMouseEnter={() => setActiveIndex(createIndex)}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors ${
                    activeIndex === createIndex ? "bg-raised text-md" : "text-dim hover:bg-lift"
                  }`}
                >
                  <span>
                    Use{" "}
                    <span className="text-accent font-medium">#{normalized || input.trim()}</span>{" "}
                    as new tag
                  </span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
