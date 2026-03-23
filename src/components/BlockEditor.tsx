import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { FileText, Bold, Italic, Code, Link2, List, Quote, Heading2 } from "lucide-react";
import { api } from "../api";
import { AttachmentMeta } from "../types";
import DatePicker from "./DatePicker";

// Split content into paragraph blocks, keeping code fences intact.
function toBlocks(content: string): string[] {
  if (!content.trim()) return [""];
  const segments: string[] = [];
  let buf = "";
  let inCode = false;

  for (const para of content.split("\n\n")) {
    const fences = (para.match(/^```/gm) ?? []).length;
    if (inCode) {
      buf += "\n\n" + para;
      if (fences % 2 === 1) {
        segments.push(buf.trim());
        buf = "";
        inCode = false;
      }
    } else {
      if (fences % 2 === 1) {
        buf = para;
        inCode = true;
      } else if (para.trim()) {
        segments.push(para.trim());
      }
    }
  }

  if (buf.trim()) segments.push(buf.trim());
  return segments.length > 0 ? segments : [""];
}

function fromBlocks(blocks: string[]): string {
  return blocks.filter((b) => b.trim()).join("\n\n");
}

const urlTransform = (url: string) => {
  if (url.startsWith("wikilink:")) return url;
  if (url.startsWith("attachment:")) return url;
  if (url.startsWith("date:")) return url;
  if (!/^[a-z][a-z\d+\-.]*:/i.test(url)) return url;
  if (/^(https?|mailto|tel|ircs?):/i.test(url)) return url;
  return "";
};

function AttachmentImage({
  filename,
  attachments,
  alt,
  width,
  height,
}: {
  filename: string;
  attachments: AttachmentMeta[];
  alt?: string;
  width?: string;
  height?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const att = attachments.find((a) => a.filename === filename);
  useEffect(() => {
    if (!att) return;
    api
      .getAttachmentData(att.id)
      .then((b64) => setSrc(`data:${att.mime_type};base64,${b64}`))
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [att?.id]);
  if (!att)
    return <span className="text-ghost text-xs italic">[attachment not found: {filename}]</span>;
  if (!src) return <span className="text-ghost text-xs italic">Loading {filename}…</span>;
  return (
    <img
      src={src}
      alt={alt ?? filename}
      className="rounded-lg"
      style={{ maxWidth: "100%", width, height }}
    />
  );
}

function preprocessWikilinks(content: string): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, "[$1](<wikilink:$1>)");
}

function isValidDate(y: number, m: number, d: number): boolean {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function formatDate(y: number, m: number, d: number): string {
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function preprocessDates(content: string): string {
  return content.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (match, y, m, d) => {
    const yn = Number(y),
      mn = Number(m),
      dn = Number(d);
    return isValidDate(yn, mn, dn) ? `[${formatDate(yn, mn, dn)}](date:${match})` : match;
  });
}

function preprocess(content: string): string {
  return preprocessDates(preprocessWikilinks(content));
}

function getWikilinkQuery(text: string, cursor: number): string | null {
  const before = text.slice(0, cursor);
  const match = before.match(/\[\[([^\]]*)$/);
  return match ? match[1] : null;
}

function getDateCommand(text: string, cursor: number): boolean {
  return /(^|\s)\/date$/.test(text.slice(0, cursor));
}

export type FormatType = "bold" | "italic" | "code" | "link" | "heading" | "blockquote" | "bullet";

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="flex items-center justify-center w-6 h-6 rounded text-ghost hover:text-lo hover:bg-raised transition-colors"
    >
      {icon}
    </button>
  );
}

interface Props {
  content: string;
  onCommit: (content: string) => void;
  onNavigate: (id: string) => void;
  onDateSelect?: (date: string) => void;
  attachments?: AttachmentMeta[];
}

export default function BlockEditor({
  content,
  onCommit,
  onNavigate,
  onDateSelect,
  attachments = [],
}: Props) {
  const [blocks, setBlocks] = useState(() => toBlocks(content));
  const [active, setActive] = useState<number | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const lastCommitted = useRef(content);
  const pendingCursorRef = useRef<number | null>(null);

  // Undo / redo history
  const historyRef = useRef<string[][]>([toBlocks(content)]);
  const historyIdxRef = useRef(0);

  const [allTitles, setAllTitles] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerAbove, setDatePickerAbove] = useState(false);

  useEffect(() => {
    api
      .getAllNoteTitles()
      .then(setAllTitles)
      .catch(() => {});
  }, []);

  // Close popover on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        taRef.current &&
        !taRef.current.contains(e.target as Node)
      ) {
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync external content changes only while not editing
  useEffect(() => {
    if (active === null && content !== lastCommitted.current) {
      setBlocks(toBlocks(content));
      lastCommitted.current = content;
    }
  }, [content, active]);

  // Focus + resize textarea when a block becomes active
  useEffect(() => {
    if (active !== null && taRef.current) {
      const ta = taRef.current;
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
      ta.focus();
      const pos = pendingCursorRef.current ?? ta.value.length;
      pendingCursorRef.current = null;
      ta.setSelectionRange(pos, pos);
    }
  }, [active]);

  const resize = () => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = taRef.current.scrollHeight + "px";
    }
  };

  const pushHistory = useCallback((newBlocks: string[]) => {
    const current = historyRef.current[historyIdxRef.current];
    if (JSON.stringify(current) === JSON.stringify(newBlocks)) return;
    const truncated = historyRef.current.slice(0, historyIdxRef.current + 1);
    truncated.push([...newBlocks]);
    historyRef.current = truncated;
    historyIdxRef.current = truncated.length - 1;
  }, []);

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current--;
    const prev = [...historyRef.current[historyIdxRef.current]];
    setBlocks(prev);
    if (active !== null && active >= prev.length) setActive(null);
    const newContent = fromBlocks(prev);
    lastCommitted.current = newContent;
    onCommit(newContent);
  }, [active, onCommit]);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current++;
    const next = [...historyRef.current[historyIdxRef.current]];
    setBlocks(next);
    if (active !== null && active >= next.length) setActive(null);
    const newContent = fromBlocks(next);
    lastCommitted.current = newContent;
    onCommit(newContent);
  }, [active, onCommit]);

  // Global Ctrl+Z / Ctrl+Shift+Z when no block is active
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (active !== null) return;
      if (e.ctrlKey && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey && e.shiftKey && e.key === "Z") || (e.ctrlKey && e.key === "y")) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [active, undo, redo]);

  // Apply inline markdown wrapping or line prefix
  const applyMarkdown = useCallback(
    (
      blockIdx: number,
      type: "bold" | "italic" | "code" | "link" | "heading" | "blockquote" | "bullet"
    ) => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const text = blocks[blockIdx];
      const sel = text.slice(start, end);
      const nb = [...blocks];

      if (type === "heading" || type === "blockquote" || type === "bullet") {
        const prefix = type === "heading" ? "## " : type === "blockquote" ? "> " : "- ";
        const lineStart = text.lastIndexOf("\n", start - 1) + 1;
        const lineText = text.slice(lineStart);
        if (lineText.startsWith(prefix)) {
          nb[blockIdx] = text.slice(0, lineStart) + lineText.slice(prefix.length);
          pushHistory(nb);
          setBlocks(nb);
          setTimeout(() => ta.setSelectionRange(start - prefix.length, end - prefix.length), 0);
        } else {
          nb[blockIdx] = text.slice(0, lineStart) + prefix + lineText;
          pushHistory(nb);
          setBlocks(nb);
          setTimeout(() => ta.setSelectionRange(start + prefix.length, end + prefix.length), 0);
        }
      } else {
        const [open, close] =
          type === "bold"
            ? ["**", "**"]
            : type === "italic"
              ? ["*", "*"]
              : type === "code"
                ? ["`", "`"]
                : ["[", "]()"]; // link
        const inserted = open + sel + close;
        nb[blockIdx] = text.slice(0, start) + inserted + text.slice(end);
        pushHistory(nb);
        setBlocks(nb);
        const cursorOffset =
          type === "link" && sel.length === 0
            ? open.length
            : open.length + sel.length + close.length;
        setTimeout(() => {
          const pos = start + cursorOffset;
          ta.setSelectionRange(
            type === "link" ? start + 1 : pos,
            type === "link" ? start + 1 + sel.length : pos
          );
        }, 0);
      }
      if (taRef.current) {
        taRef.current.style.height = "auto";
        taRef.current.style.height = taRef.current.scrollHeight + "px";
      }
    },
    [blocks, pushHistory]
  );

  const commitWikilink = useCallback(
    (title: string, blockIdx: number) => {
      const ta = taRef.current;
      if (!ta) return;
      const cursor = ta.selectionStart;
      const blockText = blocks[blockIdx];
      const before = blockText.slice(0, cursor);
      const after = blockText.slice(cursor);
      const openIdx = before.lastIndexOf("[[");
      const newBlock = before.slice(0, openIdx) + `[[${title}]]` + after;
      const nb = [...blocks];
      nb[blockIdx] = newBlock;
      setBlocks(nb);
      setSuggestions([]);
      setTimeout(() => {
        ta.focus();
        const newPos = openIdx + title.length + 4;
        ta.setSelectionRange(newPos, newPos);
      }, 0);
    },
    [blocks]
  );

  // Save block i without changing active — used when navigating between blocks
  const saveBlock = (i: number, value: string): string[] => {
    setSuggestions([]);
    const sub = toBlocks(value);
    const merged = [...blocks.slice(0, i), ...sub, ...blocks.slice(i + 1)].filter((b) => b.trim());
    const final = merged.length > 0 ? merged : [""];
    pushHistory(final);
    setBlocks(final);
    const newContent = fromBlocks(final);
    if (newContent !== lastCommitted.current) {
      lastCommitted.current = newContent;
      onCommit(newContent);
    }
    return final;
  };

  const commitBlock = (i: number, value: string) => {
    const final = saveBlock(i, value);
    // After a split, active block may have shifted — just deactivate
    void final;
    setActive(null);
  };

  const components = useMemo(
    () => ({
      a({ href, children }: { href?: string; children?: React.ReactNode }) {
        if (href?.startsWith("wikilink:")) {
          const title = decodeURIComponent(href.slice("wikilink:".length));
          return (
            <span
              className="wikilink cursor-pointer"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const linked = await api.getNoteByTitle(title);
                  if (linked) onNavigate(linked.id);
                } catch {
                  // navigation failure is non-fatal
                }
              }}
            >
              {children}
            </span>
          );
        }
        if (href?.startsWith("date:")) {
          const date = href.slice("date:".length);
          return (
            <span
              className="wikilink cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onDateSelect?.(date);
              }}
            >
              {children}
            </span>
          );
        }
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (href) api.openUrl(href).catch(console.error);
            }}
          >
            {children}
          </a>
        );
      },
      img({ src, alt }: { src?: string; alt?: string }) {
        if (src?.startsWith("attachment:")) {
          const raw = src.slice("attachment:".length);
          const [filepart, query] = raw.split("?");
          const filename = decodeURIComponent(filepart);
          const params = new URLSearchParams(query);
          return (
            <AttachmentImage
              filename={filename}
              attachments={attachments}
              alt={alt}
              width={params.get("w") ?? undefined}
              height={params.get("h") ?? undefined}
            />
          );
        }
        return <img src={src} alt={alt} className="max-w-full rounded-lg" />;
      },
    }),
    [onNavigate, onDateSelect, attachments]
  );

  return (
    <div className="markdown-content">
      {blocks.map((block, i) =>
        active === i ? (
          <div key={i} className="relative block-editing">
            {/* Floating format toolbar */}
            <div className="absolute right-0 -top-8 z-30 flex items-center gap-0.5 bg-field border bc-ui rounded-md shadow-lg px-1 py-0.5">
              <ToolbarButton
                icon={<Heading2 size={13} />}
                label="Heading (Ctrl+Shift+H)"
                onClick={() => applyMarkdown(i, "heading")}
              />
              <div className="w-px h-3 bg-raised mx-0.5 shrink-0" />
              <ToolbarButton
                icon={<Bold size={13} />}
                label="Bold (Ctrl+B)"
                onClick={() => applyMarkdown(i, "bold")}
              />
              <ToolbarButton
                icon={<Italic size={13} />}
                label="Italic (Ctrl+I)"
                onClick={() => applyMarkdown(i, "italic")}
              />
              <ToolbarButton
                icon={<Code size={13} />}
                label="Inline code (Ctrl+`)"
                onClick={() => applyMarkdown(i, "code")}
              />
              <ToolbarButton
                icon={<Link2 size={13} />}
                label="Link (Ctrl+K)"
                onClick={() => applyMarkdown(i, "link")}
              />
              <div className="w-px h-3 bg-raised mx-0.5 shrink-0" />
              <ToolbarButton
                icon={<List size={13} />}
                label="Bullet list (Ctrl+Shift+U)"
                onClick={() => applyMarkdown(i, "bullet")}
              />
              <ToolbarButton
                icon={<Quote size={13} />}
                label="Blockquote (Ctrl+Shift+B)"
                onClick={() => applyMarkdown(i, "blockquote")}
              />
            </div>
            <textarea
              ref={taRef}
              value={block}
              onChange={(e) => {
                const nb = [...blocks];
                nb[i] = e.target.value;
                setBlocks(nb);
                resize();
                // Wikilink autocomplete
                const q = getWikilinkQuery(e.target.value, e.target.selectionStart);
                if (q !== null) {
                  setSuggestions(
                    allTitles.filter((t) => t.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
                  );
                  setActiveIdx(0);
                  setShowDatePicker(false);
                } else {
                  setSuggestions([]);
                  // /date command
                  if (getDateCommand(e.target.value, e.target.selectionStart)) {
                    const rect = taRef.current?.getBoundingClientRect();
                    setDatePickerAbove(!rect || rect.top > 240);
                    setShowDatePicker(true);
                  } else {
                    setShowDatePicker(false);
                  }
                }
              }}
              onBlur={() => commitBlock(i, blocks[i])}
              onKeyDown={(e) => {
                if (showDatePicker && e.key === "Escape") {
                  setShowDatePicker(false);
                  return;
                }
                if (suggestions.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActiveIdx((x) => (x + 1) % suggestions.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActiveIdx((x) => (x - 1 + suggestions.length) % suggestions.length);
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitWikilink(suggestions[activeIdx], i);
                    return;
                  }
                  if (e.key === "Escape") {
                    setSuggestions([]);
                    return;
                  }
                }
                // Markdown formatting shortcuts
                if (e.ctrlKey && !e.shiftKey && e.key === "b") {
                  e.preventDefault();
                  applyMarkdown(i, "bold");
                  return;
                }
                if (e.ctrlKey && !e.shiftKey && e.key === "i") {
                  e.preventDefault();
                  applyMarkdown(i, "italic");
                  return;
                }
                if (e.ctrlKey && !e.shiftKey && e.key === "k") {
                  e.preventDefault();
                  applyMarkdown(i, "link");
                  return;
                }
                if (e.ctrlKey && !e.shiftKey && e.key === "`") {
                  e.preventDefault();
                  applyMarkdown(i, "code");
                  return;
                }
                if (e.ctrlKey && e.shiftKey && e.key === "H") {
                  e.preventDefault();
                  applyMarkdown(i, "heading");
                  return;
                }
                if (e.ctrlKey && e.shiftKey && e.key === "B") {
                  e.preventDefault();
                  applyMarkdown(i, "blockquote");
                  return;
                }
                if (e.ctrlKey && e.shiftKey && e.key === "U") {
                  e.preventDefault();
                  applyMarkdown(i, "bullet");
                  return;
                }

                // Undo / Redo
                if (e.ctrlKey && !e.shiftKey && e.key === "z") {
                  e.preventDefault();
                  undo();
                  return;
                }
                if ((e.ctrlKey && e.shiftKey && e.key === "Z") || (e.ctrlKey && e.key === "y")) {
                  e.preventDefault();
                  redo();
                  return;
                }

                // Tab / Shift+Tab — indent / unindent
                if (e.key === "Tab") {
                  e.preventDefault();
                  const ta = e.target as HTMLTextAreaElement;
                  const start = ta.selectionStart;
                  const end = ta.selectionEnd;
                  const text = blocks[i];
                  if (e.shiftKey) {
                    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
                    const spaces =
                      text.slice(lineStart, lineStart + 2) === "  "
                        ? 2
                        : text[lineStart] === " "
                          ? 1
                          : 0;
                    if (spaces > 0) {
                      const nb = [...blocks];
                      nb[i] = text.slice(0, lineStart) + text.slice(lineStart + spaces);
                      pushHistory(nb);
                      setBlocks(nb);
                      resize();
                      setTimeout(
                        () =>
                          ta.setSelectionRange(
                            Math.max(lineStart, start - spaces),
                            Math.max(lineStart, end - spaces)
                          ),
                        0
                      );
                    }
                  } else {
                    const nb = [...blocks];
                    nb[i] = text.slice(0, start) + "  " + text.slice(end);
                    pushHistory(nb);
                    setBlocks(nb);
                    resize();
                    setTimeout(() => ta.setSelectionRange(start + 2, start + 2), 0);
                  }
                  return;
                }

                // Smart Enter — continue bullet / ordered lists
                if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
                  const ta = e.target as HTMLTextAreaElement;
                  const cursor = ta.selectionStart;
                  const text = blocks[i];

                  // Enter at position 0 — insert empty block above
                  if (cursor === 0 && text.length > 0) {
                    e.preventDefault();
                    const nb = [...blocks.slice(0, i), "", ...blocks.slice(i)];
                    pushHistory(nb);
                    setBlocks(nb);
                    setTimeout(() => {
                      if (taRef.current) {
                        taRef.current.style.height = "auto";
                        taRef.current.style.height = taRef.current.scrollHeight + "px";
                      }
                    }, 0);
                    return;
                  }

                  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
                  const lineText = text.slice(lineStart, cursor);
                  const bulletMatch = lineText.match(/^(\s*)([-*]) /);
                  const orderedMatch = lineText.match(/^(\s*)(\d+)\. /);
                  const match = bulletMatch ?? orderedMatch;
                  if (match) {
                    const lineContent = lineText.slice(match[0].length);
                    e.preventDefault();
                    if (lineContent.trim() === "" && lineStart > 0) {
                      // Empty list item — remove prefix and stop the list
                      const nb = [...blocks];
                      nb[i] = text.slice(0, lineStart) + text.slice(lineStart + match[0].length);
                      pushHistory(nb);
                      setBlocks(nb);
                      resize();
                      setTimeout(() => ta.setSelectionRange(lineStart, lineStart), 0);
                    } else {
                      // Continue the list
                      const prefix = bulletMatch
                        ? bulletMatch[1] + bulletMatch[2] + " "
                        : orderedMatch![1] + String(parseInt(orderedMatch![2]) + 1) + ". ";
                      const insert = "\n" + prefix;
                      const nb = [...blocks];
                      nb[i] = text.slice(0, cursor) + insert + text.slice(cursor);
                      pushHistory(nb);
                      setBlocks(nb);
                      resize();
                      setTimeout(() => {
                        const pos = cursor + insert.length;
                        ta.setSelectionRange(pos, pos);
                      }, 0);
                    }
                    return;
                  }
                }

                // Arrow Up at start → move to previous block (cursor at end)
                if (e.key === "ArrowUp") {
                  const ta = e.target as HTMLTextAreaElement;
                  if (ta.selectionStart === 0 && ta.selectionEnd === 0 && i > 0) {
                    e.preventDefault();
                    saveBlock(i, blocks[i]);
                    setActive(i - 1);
                    return;
                  }
                }

                // Arrow Down at end → move to next block (cursor at start)
                if (e.key === "ArrowDown") {
                  const ta = e.target as HTMLTextAreaElement;
                  const atEnd =
                    ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length;
                  if (atEnd && i < blocks.length - 1) {
                    e.preventDefault();
                    saveBlock(i, blocks[i]);
                    pendingCursorRef.current = 0;
                    setActive(i + 1);
                    return;
                  }
                }

                if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
              }}
              className="w-full bg-transparent outline-none resize-none text-sm text-md leading-relaxed"
              style={{
                fontFamily: '"Source Serif 4 Variable", Georgia, "Times New Roman", serif',
                fontOpticalSizing: "auto",
                fontSize: "1rem",
                lineHeight: "1.6",
                minHeight: "1.6em",
                overflow: "hidden",
              }}
              rows={1}
            />

            {suggestions.length > 0 && (
              <div
                ref={popoverRef}
                className="absolute left-0 right-0 bottom-full mb-1 bg-field border bc-ui rounded-md shadow-xl z-50 overflow-hidden max-h-48 overflow-y-auto"
              >
                {suggestions.map((title, si) => (
                  <button
                    key={title}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commitWikilink(title, i);
                    }}
                    onMouseEnter={() => setActiveIdx(si)}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors ${
                      activeIdx === si ? "bg-raised text-hi" : "text-md hover:bg-lift"
                    }`}
                  >
                    <FileText size={11} className="text-ghost shrink-0" />
                    {title}
                  </button>
                ))}
              </div>
            )}
            {showDatePicker && (
              <div
                className={`absolute left-0 z-50 ${datePickerAbove ? "bottom-full mb-1" : "top-full mt-1"}`}
              >
                <DatePicker
                  onSelect={(date) => {
                    const ta = taRef.current;
                    if (!ta) return;
                    const cursor = ta.selectionStart;
                    const blockText = blocks[i];
                    const before = blockText.slice(0, cursor);
                    const after = blockText.slice(cursor);
                    const cmdMatch = before.match(/(^|\s)(\/date)$/);
                    const newBefore = cmdMatch
                      ? before.slice(0, before.length - cmdMatch[2].length) + date
                      : before + date;
                    const nb = [...blocks];
                    nb[i] = newBefore + after;
                    setBlocks(nb);
                    setShowDatePicker(false);
                    setTimeout(() => {
                      ta.focus();
                      const pos = newBefore.length;
                      ta.setSelectionRange(pos, pos);
                    }, 0);
                    const newContent = fromBlocks(
                      [...blocks.slice(0, i), newBefore + after, ...blocks.slice(i + 1)].filter(
                        (b) => b.trim()
                      )
                    );
                    lastCommitted.current = newContent;
                    onCommit(newContent);
                  }}
                  onClose={() => {
                    setShowDatePicker(false);
                    taRef.current?.focus();
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <div key={i} onClick={() => setActive(i)} className="cursor-text">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true }]]}
              urlTransform={urlTransform}
              components={components}
            >
              {preprocess(block)}
            </ReactMarkdown>
          </div>
        )
      )}

      {/* Clickable empty space at the bottom */}
      <div
        className="min-h-12 cursor-text"
        onClick={() => {
          if (blocks[blocks.length - 1].trim() === "") {
            setActive(blocks.length - 1);
          } else {
            const nb = [...blocks, ""];
            setBlocks(nb);
            setActive(nb.length - 1);
          }
        }}
      />
    </div>
  );
}
