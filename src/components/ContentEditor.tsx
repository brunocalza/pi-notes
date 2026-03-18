import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../api";
import { FileText } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}

export default function ContentEditor({ value, onChange, rows = 12, placeholder }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [allTitles, setAllTitles] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    api
      .getAllNoteTitles()
      .then(setAllTitles)
      .catch(() => {});
  }, []);

  const getWikilinkQuery = (text: string, cursor: number): string | null => {
    const before = text.slice(0, cursor);
    const match = before.match(/\[\[([^\]]*)$/);
    return match ? match[1] : null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    const cursor = e.target.selectionStart;
    const q = getWikilinkQuery(newValue, cursor);
    if (q !== null) {
      const filtered = allTitles
        .filter((t) => t.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 8);
      setSuggestions(filtered);
      setActiveIndex(0);
    } else {
      setSuggestions([]);
    }
  };

  const commit = useCallback(
    (title: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const cursor = ta.selectionStart;
      const before = value.slice(0, cursor);
      const after = value.slice(cursor);
      const openIdx = before.lastIndexOf("[[");
      const newContent = before.slice(0, openIdx) + `[[${title}]]` + after;
      onChange(newContent);
      setSuggestions([]);
      setTimeout(() => {
        ta.focus();
        const newPos = openIdx + title.length + 4; // [[ + title + ]]
        ta.setSelectionRange(newPos, newPos);
      }, 0);
    },
    [value, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setSuggestions([]);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-field border bc-ui rounded-md px-3 py-2 text-sm text-md placeholder-[#444] outline-none focus:bc-focus transition-colors resize-none font-mono"
      />

      {suggestions.length > 0 && (
        <div
          ref={popoverRef}
          className="absolute left-0 right-0 bottom-full mb-1 bg-field border bc-ui rounded-md shadow-xl z-50 overflow-hidden max-h-48 overflow-y-auto"
        >
          {suggestions.map((title, i) => (
            <button
              key={title}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(title);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors ${
                activeIndex === i ? "bg-raised text-hi" : "text-md hover:bg-lift"
              }`}
            >
              <FileText size={11} className="text-ghost shrink-0" />
              {title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
