import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { FileText } from "lucide-react";
import { api } from "../api";
import { AttachmentMeta } from "../types";

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
  if (!/^[a-z][a-z\d+\-.]*:/i.test(url)) return url;
  if (/^(https?|mailto|tel|ircs?):/i.test(url)) return url;
  return "";
};

function AttachmentImage({ filename, attachments, alt, width, height }: {
  filename: string; attachments: AttachmentMeta[]; alt?: string; width?: string; height?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const att = attachments.find((a) => a.filename === filename);
  useEffect(() => {
    if (!att) return;
    api.getAttachmentData(att.id)
      .then((b64) => setSrc(`data:${att.mime_type};base64,${b64}`))
      .catch(console.error);
  }, [att?.id]);
  if (!att) return <span className="text-ghost text-xs italic">[attachment not found: {filename}]</span>;
  if (!src) return <span className="text-ghost text-xs italic">Loading {filename}…</span>;
  return <img src={src} alt={alt ?? filename} className="rounded-lg" style={{ maxWidth: "100%", width, height }} />;
}

function preprocessWikilinks(content: string): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, "[$1](<wikilink:$1>)");
}

function getWikilinkQuery(text: string, cursor: number): string | null {
  const before = text.slice(0, cursor);
  const match = before.match(/\[\[([^\]]*)$/);
  return match ? match[1] : null;
}

interface Props {
  content: string;
  onCommit: (content: string) => void;
  onNavigate: (id: number) => void;
  attachments?: AttachmentMeta[];
}

export default function BlockEditor({ content, onCommit, onNavigate, attachments = [] }: Props) {
  const [blocks, setBlocks] = useState(() => toBlocks(content));
  const [active, setActive] = useState<number | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const lastCommitted = useRef(content);

  const [allTitles, setAllTitles] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    api.getAllNoteTitles().then(setAllTitles).catch(() => {});
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
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, [active]);

  const resize = () => {
    if (taRef.current) {
      taRef.current.style.height = "auto";
      taRef.current.style.height = taRef.current.scrollHeight + "px";
    }
  };

  // Apply inline markdown wrapping or line prefix
  const applyMarkdown = useCallback(
    (blockIdx: number, type: "bold" | "italic" | "code" | "link" | "heading" | "blockquote" | "bullet") => {
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
          setBlocks(nb);
          setTimeout(() => ta.setSelectionRange(start - prefix.length, end - prefix.length), 0);
        } else {
          nb[blockIdx] = text.slice(0, lineStart) + prefix + lineText;
          setBlocks(nb);
          setTimeout(() => ta.setSelectionRange(start + prefix.length, end + prefix.length), 0);
        }
      } else {
        const [open, close] =
          type === "bold"   ? ["**", "**"] :
          type === "italic" ? ["*",  "*"]  :
          type === "code"   ? ["`",  "`"]  :
                              ["[",  "]()"]; // link
        const inserted = open + sel + close;
        nb[blockIdx] = text.slice(0, start) + inserted + text.slice(end);
        setBlocks(nb);
        const cursorOffset = type === "link" && sel.length === 0 ? open.length : open.length + sel.length + close.length;
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
    [blocks]
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

  const commitBlock = (i: number, value: string) => {
    setSuggestions([]);
    const sub = toBlocks(value);
    const merged = [
      ...blocks.slice(0, i),
      ...sub,
      ...blocks.slice(i + 1),
    ].filter((b) => b.trim());

    const final = merged.length > 0 ? merged : [""];
    setBlocks(final);
    setActive(null);
    const newContent = fromBlocks(final);
    lastCommitted.current = newContent;
    onCommit(newContent);
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
                } catch {}
              }}
            >
              {children}
            </span>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
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
          return <AttachmentImage filename={filename} attachments={attachments} alt={alt} width={params.get("w") ?? undefined} height={params.get("h") ?? undefined} />;
        }
        return <img src={src} alt={alt} className="max-w-full rounded-lg" />;
      },
    }),
    [onNavigate, attachments]
  );

  return (
    <div className="markdown-content">
      {blocks.map((block, i) =>
        active === i ? (
          <div key={i} className="relative">
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
                } else {
                  setSuggestions([]);
                }
              }}
              onBlur={() => commitBlock(i, blocks[i])}
              onKeyDown={(e) => {
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
                if (e.ctrlKey && !e.shiftKey && e.key === "b") { e.preventDefault(); applyMarkdown(i, "bold"); return; }
                if (e.ctrlKey && !e.shiftKey && e.key === "i") { e.preventDefault(); applyMarkdown(i, "italic"); return; }
                if (e.ctrlKey && !e.shiftKey && e.key === "k") { e.preventDefault(); applyMarkdown(i, "link"); return; }
                if (e.ctrlKey && !e.shiftKey && e.key === "`") { e.preventDefault(); applyMarkdown(i, "code"); return; }
                if (e.ctrlKey && e.shiftKey && e.key === "H") { e.preventDefault(); applyMarkdown(i, "heading"); return; }
                if (e.ctrlKey && e.shiftKey && e.key === "B") { e.preventDefault(); applyMarkdown(i, "blockquote"); return; }
                if (e.ctrlKey && e.shiftKey && e.key === "U") { e.preventDefault(); applyMarkdown(i, "bullet"); return; }

                if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
              }}
              className="w-full bg-transparent outline-none resize-none text-sm text-md leading-relaxed"
              style={{ fontFamily: '"Lora", Georgia, serif', minHeight: "1.4em", overflow: "hidden" }}
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
                    onMouseDown={(e) => { e.preventDefault(); commitWikilink(title, i); }}
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
          </div>
        ) : (
          <div key={i} onClick={() => setActive(i)} className="cursor-text">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              urlTransform={urlTransform}
              components={components}
            >
              {preprocessWikilinks(block)}
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
