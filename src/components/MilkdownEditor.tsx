import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
  rootAttrsCtx,
  prosePluginsCtx,
  nodeViewCtx,
} from "@milkdown/core";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { gfm } from "@milkdown/preset-gfm";
import { history } from "@milkdown/plugin-history";
import { math } from "@milkdown/plugin-math";
import { prism } from "@milkdown/plugin-prism";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { nord } from "@milkdown/theme-nord";
import { replaceAll } from "@milkdown/utils";
import { Decoration, DecorationSet, EditorView, type NodeViewConstructor } from "prosemirror-view";
import { Plugin, TextSelection, type Command } from "prosemirror-state";
import { setBlockType, toggleMark, wrapIn } from "prosemirror-commands";
import { wrapInList } from "prosemirror-schema-list";
import { FileText, Bold, Italic, Code, Link2, List, Quote, Heading2, Plus } from "lucide-react";
import { api } from "../api";
import { AttachmentMeta } from "../types";
import DatePicker from "./DatePicker";

interface Props {
  content: string;
  onCommit: (content: string) => void;
  onNavigate: (id: string) => void;
  onDateSelect?: (date: string) => void;
  attachments?: AttachmentMeta[];
}

type WikilinkRange = {
  query: string;
  startPos: number;
  endPos: number;
};

type CursorCoords = {
  top: number;
  bottom: number;
  left: number;
};

function getTextBlockInfo(view: EditorView) {
  const { $from } = view.state.selection;
  if (!$from.parent.isTextblock) return null;
  const text = $from.parent.textBetween(0, $from.parent.content.size, "\n", "\n");
  const offset = $from.parentOffset;
  const startPos = $from.pos - offset;
  return { text, offset, startPos };
}

function buildWikilinkPlugin(onNavigate: (id: string) => void) {
  return new Plugin({
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];
        const regex = /\[\[([^\]]+)\]\]/g;
        state.doc.descendants((node, pos) => {
          if (!node.isText || !node.text) return;
          let match: RegExpExecArray | null;
          while ((match = regex.exec(node.text)) !== null) {
            const start = pos + match.index;
            const end = start + match[0].length;
            decorations.push(Decoration.inline(start, end, { class: "wikilink" }));
          }
        });
        return DecorationSet.create(state.doc, decorations);
      },
      handleClick(view, pos, event) {
        const target = event.target as HTMLElement | null;
        if (!target?.closest(".wikilink")) return false;
        const $pos = view.state.doc.resolve(pos);
        if (!$pos.parent.isTextblock) return false;
        const text = $pos.parent.textBetween(0, $pos.parent.content.size, "\n", "\n");
        const offset = $pos.parentOffset;
        const before = text.slice(0, offset);
        const after = text.slice(offset);
        const startIdx = before.lastIndexOf("[[");
        const endIdx = after.indexOf("]]");
        if (startIdx === -1 || endIdx === -1) return false;
        const title = before.slice(startIdx + 2) + after.slice(0, endIdx);
        void api
          .getNoteByTitle(title)
          .then((linked) => linked && onNavigate(linked.id))
          .catch(() => {});
        return true;
      },
    },
  });
}

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
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

export default function MilkdownEditor({
  content,
  onCommit,
  onNavigate,
  onDateSelect,
  attachments = [],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const lastMarkdownRef = useRef(content);
  const pendingCommitRef = useRef<number | null>(null);
  const [allTitles, setAllTitles] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [wikilinkQuery, setWikilinkQuery] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerAbove, setDatePickerAbove] = useState(false);
  const [wikilinkAbove, setWikilinkAbove] = useState(true);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const [focused, setFocused] = useState(false);
  const [cursorCoords, setCursorCoords] = useState<CursorCoords | null>(null);
  const wikilinkRangeRef = useRef<WikilinkRange | null>(null);
  const suggestionsRef = useRef<string[]>([]);
  const wikilinkQueryRef = useRef<string | null>(null);
  const showDatePickerRef = useRef(false);
  const attachmentsRef = useRef(attachments);
  const attachmentCacheRef = useRef(new Map<string, string>());

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    suggestionsRef.current = suggestions;
  }, [suggestions]);

  useEffect(() => {
    wikilinkQueryRef.current = wikilinkQuery;
  }, [wikilinkQuery]);

  useEffect(() => {
    showDatePickerRef.current = showDatePicker;
  }, [showDatePicker]);

  useEffect(() => {
    api
      .getAllNoteTitles()
      .then(setAllTitles)
      .catch(() => {});
  }, []);

  const scheduleCommit = useCallback(
    (markdown: string) => {
      if (pendingCommitRef.current) window.clearTimeout(pendingCommitRef.current);
      pendingCommitRef.current = window.setTimeout(() => {
        onCommit(markdown);
      }, 350);
    },
    [onCommit]
  );

  const editor = useEditor(
    (root) => {
      const wikilinkPlugin = buildWikilinkPlugin(onNavigate);
      const attachmentImageView: NodeViewConstructor = (node) => {
        const dom = document.createElement("img");
        dom.className = "rounded-lg";
        dom.alt = node.attrs.alt ?? "";
        const update = (nextNode: { attrs: { src?: string; alt?: string } }) => {
          if (!nextNode?.attrs) return false;
          const src = nextNode.attrs.src ?? "";
          dom.alt = nextNode.attrs.alt ?? "";
          if (!src) return true;
          if (src.startsWith("attachment:")) {
            const raw = src.slice("attachment:".length);
            const [filepart] = raw.split("?");
            const filename = decodeURIComponent(filepart);
            const attachment = attachmentsRef.current.find((att) => att.filename === filename);
            if (!attachment) {
              dom.removeAttribute("src");
              dom.alt = `[attachment not found: ${filename}]`;
              return true;
            }
            const cached = attachmentCacheRef.current.get(attachment.id);
            if (cached) {
              dom.src = cached;
              return true;
            }
            api
              .getAttachmentData(attachment.id)
              .then((b64) => {
                const dataUrl = `data:${attachment.mime_type};base64,${b64}`;
                attachmentCacheRef.current.set(attachment.id, dataUrl);
                dom.src = dataUrl;
              })
              .catch(() => {});
            return true;
          }
          dom.src = src;
          return true;
        };
        update(node);
        return { dom, update };
      };

      return Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(rootAttrsCtx, {
            class: "milkdown-editor text-md text-sm leading-relaxed",
          });
          ctx.set(defaultValueCtx, content);
          ctx.update(prosePluginsCtx, (plugins) => [...plugins, wikilinkPlugin]);
          const attachmentViewEntry: [string, NodeViewConstructor] = [
          "image",
          attachmentImageView,
        ];
        ctx.update(nodeViewCtx, (views) => [...views, attachmentViewEntry]);
          ctx
            .get(listenerCtx)
            .mounted((ctx) => {
              viewRef.current = ctx.get(editorViewCtx);
            })
            .markdownUpdated((_ctx, markdown) => {
              if (markdown === lastMarkdownRef.current) return;
              lastMarkdownRef.current = markdown;
              scheduleCommit(markdown);
            })
            .selectionUpdated(() => {
              if (!viewRef.current) return;
              const coords = viewRef.current.coordsAtPos(viewRef.current.state.selection.from);
              setCursorCoords({ top: coords.top, bottom: coords.bottom, left: coords.left });
            })
            .focus(() => setFocused(true))
            .blur(() => setFocused(false));
        })
        .config(nord)
        .use(gfm)
        .use(history)
        .use(math)
        .use(prism)
        .use(listener);
    },
    [content, onNavigate, scheduleCommit]
  );

  useEffect(() => {
    const instance = editor.get();
    if (!instance) return;
    if (content === lastMarkdownRef.current) return;
    lastMarkdownRef.current = content;
    instance.action(replaceAll(content, true));
  }, [content, editor]);

  const updateAutocomplete = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!view.state.selection.empty) {
      setSuggestions([]);
      setWikilinkQuery(null);
      setShowDatePicker(false);
      wikilinkRangeRef.current = null;
      return;
    }
    const info = getTextBlockInfo(view);
    if (!info) return;
    const { text, offset, startPos } = info;
    const before = text.slice(0, offset);
    const match = before.match(/\[\[([^\]]*)$/);
    if (match) {
      const query = match[1];
      const openIdx = before.lastIndexOf("[[");
      const startPosAbs = startPos + openIdx;
      const endPosAbs = view.state.selection.from;
      wikilinkRangeRef.current = { query, startPos: startPosAbs, endPos: endPosAbs };
      setSuggestions(
        allTitles.filter((t) => t.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
      );
      setWikilinkQuery(query);
      setActiveIdx(0);
      setShowDatePicker(false);
      return;
    }

    setSuggestions([]);
    setWikilinkQuery(null);
    wikilinkRangeRef.current = null;

    if (/(^|\s)\/date$/.test(before)) {
      setShowDatePicker(true);
    } else {
      setShowDatePicker(false);
    }
  }, [allTitles]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const handleUpdate = () => updateAutocomplete();
    view.dom.addEventListener("keyup", handleUpdate);
    view.dom.addEventListener("mouseup", handleUpdate);
    view.dom.addEventListener("input", handleUpdate);
    return () => {
      view.dom.removeEventListener("keyup", handleUpdate);
      view.dom.removeEventListener("mouseup", handleUpdate);
      view.dom.removeEventListener("input", handleUpdate);
    };
  }, [updateAutocomplete]);

  const commitWikilink = useCallback((title: string) => {
    const view = viewRef.current;
    const range = wikilinkRangeRef.current;
    if (!view || !range) return;
    const { state, dispatch } = view;
    const text = state.schema.text(`[[${title}]]`);
    const tr = state.tr.replaceWith(range.startPos, range.endPos, text);
    const nextPos = range.startPos + text.nodeSize;
    dispatch(tr.setSelection(TextSelection.create(tr.doc, nextPos)));
    view.focus();
    setSuggestions([]);
    setWikilinkQuery(null);
    wikilinkRangeRef.current = null;
  }, []);

  const createAndCommitWikilink = useCallback(
    async (title: string) => {
      try {
        await api.insertNote(title, "", []);
        setAllTitles((prev) => [...prev, title]);
        commitWikilink(title);
      } catch {
        commitWikilink(title);
      }
    },
    [commitWikilink]
  );

  const insertDate = useCallback(
    (date: string) => {
      const view = viewRef.current;
      if (!view) return;
      const info = getTextBlockInfo(view);
      if (!info) return;
      const { text, offset, startPos } = info;
      const before = text.slice(0, offset);
      const match = before.match(/(^|\s)(\/date)$/);
      const replaceStart = match
        ? startPos + before.length - match[2].length
        : startPos + before.length;
      const replaceEnd = view.state.selection.from;
      const tr = view.state.tr.insertText(date, replaceStart, replaceEnd);
      const nextPos = replaceStart + date.length;
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, nextPos)));
      view.focus();
      setShowDatePicker(false);
      onDateSelect?.(date);
    },
    [onDateSelect]
  );

  const runCommand = useCallback((command: Command) => {
    const view = viewRef.current;
    if (!view) return;
    command(view.state, view.dispatch, view);
    view.focus();
  }, []);

  const toolbarHandlers = useMemo(
    () => ({
      heading: () => {
        const view = viewRef.current;
        if (!view) return;
        runCommand(setBlockType(view.state.schema.nodes.heading, { level: 2 }));
      },
      bold: () => {
        const view = viewRef.current;
        if (!view) return;
        runCommand(toggleMark(view.state.schema.marks.strong));
      },
      italic: () => {
        const view = viewRef.current;
        if (!view) return;
        runCommand(toggleMark(view.state.schema.marks.em));
      },
      code: () => {
        const view = viewRef.current;
        if (!view) return;
        runCommand(toggleMark(view.state.schema.marks.code));
      },
      link: () => {
        const view = viewRef.current;
        if (!view) return;
        const href = window.prompt("URL");
        if (!href) return;
        runCommand(toggleMark(view.state.schema.marks.link, { href }));
      },
      bullet: () => {
        const view = viewRef.current;
        if (!view) return;
        runCommand(wrapInList(view.state.schema.nodes.bullet_list));
      },
      blockquote: () => {
        const view = viewRef.current;
        if (!view) return;
        runCommand(wrapIn(view.state.schema.nodes.blockquote));
      },
    }),
    [runCommand]
  );

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (showDatePickerRef.current && event.key === "Escape") {
        setShowDatePicker(false);
        return;
      }
      const currentSuggestions = suggestionsRef.current;
      const currentQuery = wikilinkQueryRef.current;
      if (currentSuggestions.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveIdx((idx) => (idx + 1) % currentSuggestions.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIdx((idx) => (idx - 1 + currentSuggestions.length) % currentSuggestions.length);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          commitWikilink(currentSuggestions[activeIdx]);
          return;
        }
        if (event.key === "Escape") {
          setSuggestions([]);
          setWikilinkQuery(null);
          wikilinkRangeRef.current = null;
          return;
        }
      } else if (currentQuery && currentQuery.trim() !== "") {
        if (event.key === "Enter") {
          event.preventDefault();
          void createAndCommitWikilink(currentQuery);
          return;
        }
        if (event.key === "Escape") {
          setWikilinkQuery(null);
          wikilinkRangeRef.current = null;
        }
      }
    };
    view.dom.addEventListener("keydown", handleKeyDown);
    return () => view.dom.removeEventListener("keydown", handleKeyDown);
  }, [activeIdx, commitWikilink, createAndCommitWikilink]);

  useEffect(() => {
    if (!cursorCoords || !popoverRef.current) return;
    const popRect = popoverRef.current.getBoundingClientRect();
    const gap = 8;
    const spaceAbove = cursorCoords.top;
    const spaceBelow = window.innerHeight - cursorCoords.bottom;
    if (spaceAbove < popRect.height + gap && spaceBelow >= popRect.height + gap) {
      setWikilinkAbove(false);
    } else if (spaceBelow < popRect.height + gap && spaceAbove >= popRect.height + gap) {
      setWikilinkAbove(true);
    } else {
      setWikilinkAbove(spaceAbove >= spaceBelow);
    }
  }, [cursorCoords, suggestions.length, wikilinkQuery]);

  useEffect(() => {
    if (!cursorCoords || !datePickerRef.current) return;
    const pickerRect = datePickerRef.current.getBoundingClientRect();
    const gap = 8;
    const spaceAbove = cursorCoords.top;
    const spaceBelow = window.innerHeight - cursorCoords.bottom;
    if (spaceAbove < pickerRect.height + gap && spaceBelow >= pickerRect.height + gap) {
      setDatePickerAbove(false);
    } else if (spaceBelow < pickerRect.height + gap && spaceAbove >= pickerRect.height + gap) {
      setDatePickerAbove(true);
    } else {
      setDatePickerAbove(spaceAbove >= spaceBelow);
    }
  }, [cursorCoords, showDatePicker]);

  useEffect(() => {
    if (!focused || !cursorCoords || !containerRef.current) {
      setToolbarPos(null);
      return;
    }
    const containerRect = containerRef.current.getBoundingClientRect();
    const toolbarWidth = 200;
    const top = cursorCoords.top - containerRect.top - 40;
    const left = cursorCoords.left - containerRect.left - toolbarWidth / 2;
    const clampedLeft = Math.min(
      Math.max(left, 8),
      Math.max(8, containerRect.width - toolbarWidth - 8)
    );
    setToolbarPos({ top: Math.max(8, top), left: clampedLeft });
  }, [cursorCoords, focused]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        datePickerRef.current &&
        !datePickerRef.current.contains(event.target as Node) &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setSuggestions([]);
        setWikilinkQuery(null);
        setShowDatePicker(false);
        wikilinkRangeRef.current = null;
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {toolbarPos && (
        <div
          className="absolute z-40 flex items-center gap-0.5 bg-field border bc-ui rounded-md shadow-lg px-1 py-0.5"
          style={{ top: toolbarPos.top, left: toolbarPos.left }}
        >
          <ToolbarButton
            icon={<Heading2 size={13} />}
            label="Heading"
            onClick={toolbarHandlers.heading}
          />
          <div className="w-px h-3 bg-raised mx-0.5 shrink-0" />
          <ToolbarButton icon={<Bold size={13} />} label="Bold" onClick={toolbarHandlers.bold} />
          <ToolbarButton
            icon={<Italic size={13} />}
            label="Italic"
            onClick={toolbarHandlers.italic}
          />
          <ToolbarButton
            icon={<Code size={13} />}
            label="Inline code"
            onClick={toolbarHandlers.code}
          />
          <ToolbarButton icon={<Link2 size={13} />} label="Link" onClick={toolbarHandlers.link} />
          <div className="w-px h-3 bg-raised mx-0.5 shrink-0" />
          <ToolbarButton
            icon={<List size={13} />}
            label="Bullet"
            onClick={toolbarHandlers.bullet}
          />
          <ToolbarButton
            icon={<Quote size={13} />}
            label="Blockquote"
            onClick={toolbarHandlers.blockquote}
          />
        </div>
      )}

      <MilkdownProvider>
        <Milkdown />
      </MilkdownProvider>

      {(suggestions.length > 0 || (wikilinkQuery && wikilinkQuery.trim() !== "")) && (
        <div
          ref={popoverRef}
          className={`absolute left-0 right-0 ${
            wikilinkAbove ? "bottom-full mb-1" : "top-full mt-1"
          } bg-field border bc-ui rounded-md shadow-xl z-50 overflow-hidden max-h-48 overflow-y-auto`}
        >
          {suggestions.map((title, index) => (
            <button
              key={title}
              onMouseDown={(e) => {
                e.preventDefault();
                commitWikilink(title);
              }}
              onMouseEnter={() => setActiveIdx(index)}
              className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors ${
                activeIdx === index ? "bg-raised text-hi" : "text-md hover:bg-lift"
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
                void createAndCommitWikilink(wikilinkQuery);
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
          ref={datePickerRef}
          className={`absolute left-0 z-50 ${datePickerAbove ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
          <DatePicker
            onSelect={(date) => insertDate(date)}
            onClose={() => {
              setShowDatePicker(false);
              viewRef.current?.focus();
            }}
          />
        </div>
      )}
    </div>
  );
}
