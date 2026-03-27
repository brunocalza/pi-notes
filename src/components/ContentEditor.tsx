import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../api";
import { FileText, Plus } from "lucide-react";
import DatePicker from "./DatePicker";

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
  const [wikilinkQuery, setWikilinkQuery] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerAbove, setDatePickerAbove] = useState(false);

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

  const getDateCommand = (text: string, cursor: number): boolean => {
    return /(^|\s)\/date$/.test(text.slice(0, cursor));
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
      setWikilinkQuery(q);
      setActiveIndex(0);
      setShowDatePicker(false);
    } else {
      setSuggestions([]);
      setWikilinkQuery(null);
      if (getDateCommand(newValue, cursor)) {
        const rect = textareaRef.current?.getBoundingClientRect();
        setDatePickerAbove(!rect || rect.top > 240);
        setShowDatePicker(true);
      } else {
        setShowDatePicker(false);
      }
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
      setWikilinkQuery(null);
      setTimeout(() => {
        ta.focus();
        const newPos = openIdx + title.length + 4; // [[ + title + ]]
        ta.setSelectionRange(newPos, newPos);
      }, 0);
    },
    [value, onChange]
  );

  const createAndCommit = useCallback(
    async (title: string) => {
      try {
        await api.insertNote(title, "", []);
        setAllTitles((prev) => [...prev, title]);
        commit(title);
      } catch {
        commit(title);
      }
    },
    [commit]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showDatePicker && e.key === "Escape") {
      setShowDatePicker(false);
      return;
    }
    if (suggestions.length > 0) {
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
        setWikilinkQuery(null);
      }
    } else if (wikilinkQuery && wikilinkQuery.trim() !== "") {
      if (e.key === "Enter") {
        e.preventDefault();
        void createAndCommit(wikilinkQuery);
      } else if (e.key === "Escape") {
        setWikilinkQuery(null);
      }
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

      {(suggestions.length > 0 || (wikilinkQuery && wikilinkQuery.trim() !== "")) && (
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
          {suggestions.length === 0 && wikilinkQuery && wikilinkQuery.trim() !== "" && (
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                void createAndCommit(wikilinkQuery);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors bg-raised text-hi"
            >
              <Plus size={11} className="text-ghost shrink-0" />
              Create &ldquo;{wikilinkQuery}&rdquo;
            </button>
          )}
        </div>
      )}
      {showDatePicker && (
        <div
          className={`absolute left-0 z-50 ${datePickerAbove ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
          <DatePicker
            onSelect={(date) => {
              const ta = textareaRef.current;
              if (!ta) return;
              const cursor = ta.selectionStart;
              const before = value.slice(0, cursor);
              const after = value.slice(cursor);
              const cmdMatch = before.match(/(^|\s)(\/date)$/);
              const newBefore = cmdMatch
                ? before.slice(0, before.length - cmdMatch[2].length) + date
                : before + date;
              onChange(newBefore + after);
              setShowDatePicker(false);
              setTimeout(() => {
                ta.focus();
                const pos = newBefore.length;
                ta.setSelectionRange(pos, pos);
              }, 0);
            }}
            onClose={() => {
              setShowDatePicker(false);
              textareaRef.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
