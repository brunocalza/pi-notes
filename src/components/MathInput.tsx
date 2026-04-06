import { useEffect, useRef, useState } from "react";
import katex from "katex";

interface Props {
  initialValue: string;
  displayMode?: boolean;
  onSubmit: (latex: string) => void;
  onClose: () => void;
}

export default function MathInput({ initialValue, displayMode, onSubmit, onClose }: Props) {
  const [value, setValue] = useState(initialValue);
  const previewRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const len = initialValue.length;
    inputRef.current?.setSelectionRange(len, len);
  }, [initialValue]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    if (!value.trim()) {
      el.textContent = "";
      return;
    }
    try {
      katex.render(value, el, { displayMode: !!displayMode, throwOnError: false });
    } catch {
      el.textContent = value;
    }
  }, [value, displayMode]);

  const handleSubmit = () => {
    onSubmit(value);
  };

  return (
    <div
      className="bg-field border bc-ui rounded-md shadow-xl z-50 p-3 w-72"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Live preview */}
      <div
        ref={previewRef}
        className={`min-h-[1.5em] mb-2 px-2 py-1.5 rounded bg-lift text-md text-sm ${displayMode ? "text-center" : ""}`}
      />

      {/* Input */}
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSubmit();
          }
          if (e.key === "Enter" && !e.shiftKey && !displayMode) {
            e.preventDefault();
            handleSubmit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        placeholder="E = mc^2"
        rows={displayMode ? 3 : 1}
        className="w-full font-mono text-xs px-2 py-1.5 rounded border bc-ui bg-base text-md outline-none focus:border-accent resize-none"
      />

      {/* Hint */}
      <div className="text-[10px] text-ghost mt-1.5">
        {displayMode ? "Ctrl+Enter to insert" : "Enter to insert"} · Esc to cancel
      </div>
    </div>
  );
}
