import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  Editor,
  defaultValueCtx,
  editorViewCtx,
  rootCtx,
  rootAttrsCtx,
  nodeViewCtx,
  prosePluginsCtx,
} from "@milkdown/core";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { history } from "@milkdown/plugin-history";
import { indent, indentConfig } from "@milkdown/plugin-indent";
import { clipboard } from "@milkdown/plugin-clipboard";
import { trailing } from "@milkdown/plugin-trailing";
import { math } from "@milkdown/plugin-math";
import { prism, prismConfig } from "@milkdown/plugin-prism";
import { refractor } from "refractor/all";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { tooltipFactory, TooltipProvider } from "@milkdown/plugin-tooltip";
import { slashFactory, SlashProvider } from "@milkdown/plugin-slash";
import { replaceAll } from "@milkdown/utils";
import { EditorView, type NodeViewConstructor } from "prosemirror-view";
import { Plugin, TextSelection } from "prosemirror-state";
import { toggleMark } from "prosemirror-commands";
import { createRoot } from "react-dom/client";
import * as nodeEmoji from "node-emoji";
import { FileText, Plus, Pencil, Unlink, Check } from "lucide-react";
import { api } from "../api";
import { AttachmentMeta, NoteSummary } from "../types";
import DatePicker from "./DatePicker";
import {
  formatDateLabel,
  TOOLBAR_ICONS,
  LANGUAGES,
  parseImageWidth,
  setImageWidth,
  filterSummaries,
  hasDuplicateTitle,
  formatShortDate,
} from "./milkdown-utils";

interface Props {
  content: string;
  onCommit: (content: string) => void;
  onNavigate: (id: string) => void;
  onDateSelect?: (date: string) => void;
  onDateLinked?: () => void;
  attachments?: AttachmentMeta[];
}

type EmojiResult = { emoji: string; name: string };

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

// Module-level plugin instances (one per editor type)
const selectionTooltip = tooltipFactory("SELECTION");
const dateSlash = slashFactory("DATE");

function getTextBlockInfo(view: EditorView) {
  const { $from } = view.state.selection;
  if (!$from.parent.isTextblock) return null;
  const text = $from.parent.textBetween(0, $from.parent.content.size, "\n", "\n");
  const offset = $from.parentOffset;
  const startPos = $from.pos - offset;
  return { text, offset, startPos };
}

type LinkClickDetail = { from: number; to: number; href: string; rect: DOMRect };

function buildBubbleMenuDom(viewRef: RefObject<EditorView | null>): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "milkdown-bubble-menu";

  const toolbar = document.createElement("div");
  toolbar.className = "milkdown-bubble-toolbar";

  const btn = (icon: string, title: string, action: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.title = title;
    const parsed = new DOMParser().parseFromString(icon, "image/svg+xml");
    b.appendChild(b.ownerDocument.importNode(parsed.documentElement, true));
    b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      action();
    });
    return b;
  };

  const markBtn = (icon: string, title: string, markName: string, attrs?: object) =>
    btn(icon, title, () => {
      const view = viewRef.current;
      if (!view) return;
      const mark = view.state.schema.marks[markName];
      if (mark) toggleMark(mark, attrs)(view.state, view.dispatch, view);
      viewRef.current?.focus();
    });

  toolbar.appendChild(markBtn(TOOLBAR_ICONS.bold, "Bold", "strong"));
  toolbar.appendChild(markBtn(TOOLBAR_ICONS.italic, "Italic", "emphasis"));
  toolbar.appendChild(markBtn(TOOLBAR_ICONS.strikethrough, "Strikethrough", "strike_through"));
  toolbar.appendChild(markBtn(TOOLBAR_ICONS.code, "Inline code", "inlineCode"));
  toolbar.appendChild(
    btn(TOOLBAR_ICONS.link, "Link", () => {
      const view = viewRef.current;
      if (!view) return;
      const { from, to, $from } = view.state.selection;
      if (from === to) return;
      let existingHref = "";
      const linkType = view.state.schema.marks.link;
      if (linkType) {
        const linkMark = $from.marks().find((m) => m.type === linkType);
        if (linkMark) existingHref = linkMark.attrs.href ?? "";
      }
      document.dispatchEvent(
        new CustomEvent<LinkClickDetail>("milkdown-link-click", {
          detail: { from, to, href: existingHref, rect: wrap.getBoundingClientRect() },
        })
      );
    })
  );

  wrap.appendChild(toolbar);
  return wrap;
}

export function WikilinkEditPopover({
  rect,
  query,
  activeIdx,
  allSummaries,
  popoverRef,
  onQueryChange,
  onSelect,
  onClose,
  onActiveIdxChange,
}: {
  rect: { top: number; bottom: number; left: number };
  query: string;
  activeIdx: number;
  allSummaries: NoteSummary[];
  popoverRef: RefObject<HTMLDivElement | null>;
  onQueryChange: (q: string) => void;
  onSelect: (note: { id: string; title: string }) => void;
  onClose: () => void;
  onActiveIdxChange: (idx: number) => void;
}) {
  const filtered = filterSummaries(allSummaries, query);

  return (
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        left: rect.left,
        top: rect.bottom + 4,
      }}
      className="z-50 bg-field border bc-ui rounded-md shadow-xl overflow-hidden w-64"
    >
      <input
        type="text"
        autoFocus
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            onClose();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            onActiveIdxChange((activeIdx + 1) % Math.max(filtered.length, 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            onActiveIdxChange(
              (activeIdx - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1)
            );
          } else if (e.key === "Enter" && filtered.length > 0) {
            e.preventDefault();
            onSelect(filtered[activeIdx]);
          }
        }}
        placeholder="Search notes…"
        className="w-full px-3 py-2 text-xs bg-transparent border-b bc-ui outline-none"
      />
      <div className="max-h-48 overflow-y-auto">
        {filtered.map((s, index) => {
          const showDisambig = hasDuplicateTitle(filtered, s.title);
          return (
            <button
              key={s.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(s);
              }}
              onMouseEnter={() => onActiveIdxChange(index)}
              className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors ${
                activeIdx === index ? "bg-raised text-hi" : "text-md hover:bg-lift"
              }`}
            >
              <FileText size={11} className="text-ghost shrink-0" />
              <span className="flex flex-col min-w-0">
                <span className="truncate">{s.title}</span>
                {showDisambig && (
                  <span className="text-ghost text-[10px] truncate">
                    {formatShortDate(s.created_at)}
                    {s.snippet ? ` — ${s.snippet}` : ""}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MilkdownEditorInner({
  content,
  onCommit,
  onNavigate,
  onDateSelect,
  onDateLinked,
  attachments = [],
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const slashProviderRef = useRef<SlashProvider | null>(null);
  const lastMarkdownRef = useRef(content);
  const lastCommittedRef = useRef(content);
  const pendingCommitRef = useRef<number | null>(null);
  const onCommitRef = useRef(onCommit);
  const onNavigateRef = useRef(onNavigate);
  const onDateSelectRef = useRef(onDateSelect);
  const onDateLinkedRef = useRef(onDateLinked);
  const [allSummaries, setAllSummaries] = useState<NoteSummary[]>([]);
  const [suggestions, setSuggestions] = useState<NoteSummary[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [wikilinkQuery, setWikilinkQuery] = useState<string | null>(null);
  const [cursorCoords, setCursorCoords] = useState<CursorCoords | null>(null);
  const wikilinkRangeRef = useRef<WikilinkRange | null>(null);
  const suggestionsRef = useRef<NoteSummary[]>([]);
  const wikilinkQueryRef = useRef<string | null>(null);
  const [emojiSuggestions, setEmojiSuggestions] = useState<EmojiResult[]>([]);
  const [emojiActiveIdx, setEmojiActiveIdx] = useState(0);
  const emojiRangeRef = useRef<{ startPos: number; endPos: number } | null>(null);
  const emojiSuggestionsRef = useRef<EmojiResult[]>([]);
  const [editingDate, setEditingDate] = useState<{
    from: number;
    to: number;
    rect: { top: number; bottom: number; left: number };
  } | null>(null);
  const [editingWikilink, setEditingWikilink] = useState<{
    from: number;
    to: number;
    rect: { top: number; bottom: number; left: number };
  } | null>(null);
  const [editWikilinkQuery, setEditWikilinkQuery] = useState("");
  const [editWikilinkActiveIdx, setEditWikilinkActiveIdx] = useState(0);
  const editWikilinkRef = useRef<HTMLDivElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const [linkPopover, setLinkPopover] = useState<{
    from: number;
    to: number;
    href: string;
    rect: { top: number; bottom: number; left: number };
    editing: boolean;
  } | null>(null);
  const [linkPopoverUrl, setLinkPopoverUrl] = useState("");
  const linkPopoverRef = useRef<HTMLDivElement>(null);
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
    emojiSuggestionsRef.current = emojiSuggestions;
  }, [emojiSuggestions]);

  useEffect(() => {
    api
      .getAllNoteSummaries()
      .then(setAllSummaries)
      .catch(() => {});
  }, []);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    onDateSelectRef.current = onDateSelect;
  }, [onDateSelect]);

  useEffect(() => {
    onDateLinkedRef.current = onDateLinked;
  }, [onDateLinked]);

  const scheduleCommit = useCallback((markdown: string) => {
    if (pendingCommitRef.current) window.clearTimeout(pendingCommitRef.current);
    pendingCommitRef.current = window.setTimeout(() => {
      lastCommittedRef.current = markdown;
      onCommitRef.current(markdown);
    }, 350);
  }, []);

  const editor = useEditor((root) => {
    const bubbleMenuDom = buildBubbleMenuDom(viewRef);
    const tooltipProvider = new TooltipProvider({
      content: bubbleMenuDom,
      offset: 8,
      shouldShow: (view) => {
        const { empty, $from } = view.state.selection;
        if (empty || !view.hasFocus()) return false;
        // Hide toolbar inside code blocks
        if ($from.parent.type.name === "code_block") return false;
        // Hide toolbar when selection is on an external link
        const linkType = view.state.schema.marks.link;
        if (linkType) {
          const linkMark = $from.marks().find((m) => m.type === linkType);
          if (linkMark) {
            const href = linkMark.attrs.href ?? "";
            if (!href.startsWith("date:") && !href.startsWith("wikilink:")) return false;
          }
        }
        return true;
      },
    });
    // Slash plugin for /date command
    const slashEl = document.createElement("div");
    slashEl.className = "milkdown-slash-menu";
    slashEl.dataset.show = "false";
    const slashReactRoot = createRoot(slashEl);

    const slashProvider = new SlashProvider({
      content: slashEl,
      shouldShow: (view) => {
        const { selection } = view.state;
        const { empty, $from } = selection;
        if (!empty || !view.hasFocus()) return false;
        const text = $from.parent.textBetween(
          Math.max(0, $from.parentOffset - 500),
          $from.parentOffset,
          undefined,
          "\uFFFC"
        );
        return /(^|\s)\/date$/.test(text);
      },
    });

    slashProviderRef.current = slashProvider;

    slashProvider.onShow = () => {
      // Capture position now — clicking the date picker may move focus
      const savedFrom = viewRef.current?.state.selection.from ?? null;

      slashReactRoot.render(
        <DatePicker
          onSelect={(date) => {
            const view = viewRef.current;
            if (view && savedFrom !== null) {
              const { state } = view;
              const label = formatDateLabel(date);
              const linkMark = state.schema.marks.link?.create({ href: `date:${date}` });
              const textNode = state.schema.text(label, linkMark ? [linkMark] : []);
              const replaceStart = savedFrom - 5; // "/date" is 5 chars
              let tr = state.tr.replaceWith(replaceStart, savedFrom, textNode);
              tr = tr.setSelection(TextSelection.create(tr.doc, replaceStart + label.length));
              if (linkMark) tr = tr.removeStoredMark(linkMark.type);
              view.dispatch(tr);
              view.focus();
              onDateLinkedRef.current?.();
            }
            slashProvider.hide();
          }}
          onClose={() => {
            slashProvider.hide();
            viewRef.current?.focus();
          }}
        />
      );
    };

    const attachmentImageView: NodeViewConstructor = (node, editorView, getPos) => {
      // Wrapper div
      const dom = document.createElement("div");
      dom.className = "milkdown-image-wrapper";

      const img = document.createElement("img");
      img.className = "milkdown-image";

      // Resize handle
      const handle = document.createElement("div");
      handle.className = "milkdown-image-handle";

      dom.appendChild(img);
      dom.appendChild(handle);

      const setImageSrc = (src: string) => {
        if (!src) return;
        if (src.startsWith("attachment:")) {
          const raw = src.slice("attachment:".length);
          const [filepart] = raw.split("?");
          const filename = decodeURIComponent(filepart);
          const attachment = attachmentsRef.current.find((att) => att.filename === filename);
          if (!attachment) {
            img.removeAttribute("src");
            img.alt = `[attachment not found: ${filename}]`;
            return;
          }
          const cached = attachmentCacheRef.current.get(attachment.id);
          if (cached) {
            img.src = cached;
            return;
          }
          api
            .getAttachmentData(attachment.id)
            .then((b64) => {
              const dataUrl = `data:${attachment.mime_type};base64,${b64}`;
              attachmentCacheRef.current.set(attachment.id, dataUrl);
              img.src = dataUrl;
            })
            .catch(() => {});
        } else {
          img.src = src;
        }
      };

      const applyAttrs = (attrs: { src?: string; alt?: string; width?: string }) => {
        const src = attrs.src ?? "";
        img.alt = attrs.alt ?? "";
        const w = parseImageWidth(src) || (attrs.width ? parseInt(attrs.width, 10) : null);
        if (w) {
          dom.style.width = `${w}px`;
        } else {
          dom.style.width = "";
        }
        setImageSrc(src);
      };

      applyAttrs(node.attrs);

      // Resize drag handling
      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = dom.offsetWidth;

        const onMouseMove = (ev: MouseEvent) => {
          const newW = Math.max(80, startW + (ev.clientX - startX));
          dom.style.width = `${newW}px`;
        };

        const onMouseUp = (ev: MouseEvent) => {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          const finalW = Math.max(80, startW + (ev.clientX - startX));
          dom.style.width = `${finalW}px`;

          // Persist width into the node's src attribute
          const pos = typeof getPos === "function" ? getPos() : null;
          if (pos == null) return;
          const nodeAtPos = editorView.state.doc.nodeAt(pos);
          if (!nodeAtPos) return;
          const oldSrc: string = nodeAtPos.attrs.src ?? "";
          const newSrc = setImageWidth(oldSrc, finalW);
          const tr = editorView.state.tr.setNodeMarkup(pos, undefined, {
            ...nodeAtPos.attrs,
            src: newSrc,
          });
          editorView.dispatch(tr);
        };

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });

      return {
        dom,
        update(nextNode) {
          if (nextNode.type.name !== "image") return false;
          applyAttrs(nextNode.attrs);
          return true;
        },
        stopEvent(event) {
          return event.type === "mousedown" && event.target === handle;
        },
      };
    };

    const codeBlockView: NodeViewConstructor = (node, editorView, getPos) => {
      let currentLang = node.attrs.language ?? "";

      const dom = document.createElement("div");
      dom.className = "milkdown-codeblock";

      const header = document.createElement("div");
      header.className = "milkdown-codeblock-header";

      // Custom dropdown trigger
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "milkdown-codeblock-lang";
      trigger.textContent = currentLang || "plain text";

      // Dropdown menu
      const menu = document.createElement("div");
      menu.className = "milkdown-codeblock-menu";
      menu.style.display = "none";

      for (const lang of LANGUAGES) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "milkdown-codeblock-menu-item";
        item.textContent = lang || "plain text";
        if (lang === currentLang) item.classList.add("active");
        item.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const pos = typeof getPos === "function" ? getPos() : null;
          if (pos == null) return;
          const nodeAtPos = editorView.state.doc.nodeAt(pos);
          if (!nodeAtPos) return;
          const tr = editorView.state.tr.setNodeMarkup(pos, undefined, {
            ...nodeAtPos.attrs,
            language: lang,
          });
          editorView.dispatch(tr);
          currentLang = lang;
          trigger.textContent = lang || "plain text";
          menu.style.display = "none";
          // Update active class
          menu.querySelectorAll(".milkdown-codeblock-menu-item").forEach((el, i) => {
            el.classList.toggle("active", LANGUAGES[i] === lang);
          });
          editorView.focus();
        });
        menu.appendChild(item);
      }

      trigger.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = menu.style.display !== "none";
        if (isOpen) {
          menu.style.display = "none";
        } else {
          const rect = trigger.getBoundingClientRect();
          menu.style.position = "fixed";
          menu.style.top = `${rect.bottom + 4}px`;
          menu.style.right = `${window.innerWidth - rect.right}px`;
          menu.style.left = "";
          menu.style.display = "";
        }
      });

      // Close menu on outside click
      const outsideHandler = (e: MouseEvent) => {
        if (!header.contains(e.target as Node) && !menu.contains(e.target as Node)) {
          menu.style.display = "none";
        }
      };
      document.addEventListener("mousedown", outsideHandler);

      header.appendChild(trigger);
      document.body.appendChild(menu);

      const contentDOM = document.createElement("pre");
      contentDOM.className = "milkdown-codeblock-pre";
      const code = document.createElement("code");
      contentDOM.appendChild(code);

      dom.appendChild(header);
      dom.appendChild(contentDOM);

      return {
        dom,
        contentDOM: code,
        update(nextNode) {
          if (nextNode.type.name !== "code_block") return false;
          const lang = nextNode.attrs.language ?? "";
          if (currentLang !== lang) {
            currentLang = lang;
            trigger.textContent = lang || "plain text";
            menu.querySelectorAll(".milkdown-codeblock-menu-item").forEach((el, i) => {
              el.classList.toggle("active", LANGUAGES[i] === lang);
            });
          }
          return true;
        },
        stopEvent(event) {
          return header.contains(event.target as Node);
        },
        destroy() {
          document.removeEventListener("mousedown", outsideHandler);
          menu.remove();
        },
      };
    };

    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(rootAttrsCtx, {
          class: "milkdown-editor text-md text-sm leading-relaxed",
        });
        ctx.set(defaultValueCtx, content);
        const imageEntry: [string, NodeViewConstructor] = ["image", attachmentImageView];
        const codeEntry: [string, NodeViewConstructor] = ["code_block", codeBlockView];
        ctx.update(nodeViewCtx, (views) => [...views, imageEntry, codeEntry]);
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(indent)
      .config((ctx) => {
        ctx.set(indentConfig.key, { type: "space" as const, size: 4 });
      })
      .use(clipboard)
      .use(trailing)
      .use(math)
      .use(prism)
      .config((ctx) => {
        ctx.set(prismConfig.key, {
          configureRefractor: () => refractor,
        });
      })
      .use(listener)
      .use(selectionTooltip)
      .use(dateSlash)
      .config((ctx) => {
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
            const view = viewRef.current;
            if (!view) return;
            try {
              const coords = view.coordsAtPos(view.state.selection.from);
              setCursorCoords({ top: coords.top, bottom: coords.bottom, left: coords.left });
            } catch {
              // coordsAtPos can throw at certain node boundaries; ignore
            }
          });

        ctx.set(selectionTooltip.key, {
          view: () => ({
            update: (v: EditorView, p: typeof v.state) => tooltipProvider.update(v, p),
            destroy: () => tooltipProvider.destroy(),
          }),
        });

        ctx.set(dateSlash.key, {
          view: () => ({
            update: (v: EditorView, p: typeof v.state) => slashProvider.update(v, p),
            destroy: () => slashProvider.destroy(),
          }),
        });

        ctx.update(prosePluginsCtx, (plugins) => [
          ...plugins,
          // Clear stored link marks when cursor is not inside a link
          // (e.g., after deleting a date/wikilink with backspace)
          new Plugin({
            appendTransaction: (_trs, _oldState, newState) => {
              const linkType = newState.schema.marks.link;
              if (!linkType) return null;
              const { $from, empty } = newState.selection;
              if (!empty) return null;
              const hasLinkAtCursor = linkType.isInSet($from.marks());
              const hasStoredLink = newState.storedMarks && linkType.isInSet(newState.storedMarks);
              if (!hasLinkAtCursor && hasStoredLink) {
                return newState.tr.removeStoredMark(linkType);
              }
              return null;
            },
          }),
          new Plugin({
            props: {
              // Prevent ProseMirror node selection on Ctrl+click links
              handleClickOn(view, pos, _node, _nodePos, event) {
                if (!(event.ctrlKey || event.metaKey)) return false;
                const $pos = view.state.doc.resolve(pos);
                if ($pos.marks().some((m) => m.type.name === "link")) return true;
                return false;
              },
              // Ctrl+A inside code block selects only the block content
              handleKeyDown(view, event) {
                if (event.key !== "a" || !(event.ctrlKey || event.metaKey)) return false;
                const { $from } = view.state.selection;
                if ($from.parent.type.name !== "code_block") return false;
                const start = $from.start();
                const end = $from.end();
                const tr = view.state.tr.setSelection(
                  TextSelection.create(view.state.doc, start, end)
                );
                view.dispatch(tr);
                return true;
              },
            },
          }),
        ]);
      });
  }, []);

  useEffect(() => {
    const instance = editor.get();
    if (!instance) return;
    // Skip if the editor already shows this content
    if (content === lastMarkdownRef.current) return;
    // Skip if it's just our own commit bouncing back from the parent
    if (content === lastCommittedRef.current) return;
    lastMarkdownRef.current = content;
    lastCommittedRef.current = content;
    instance.action(replaceAll(content, true));
  }, [content, editor]);

  const updateAutocomplete = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    // Keep cursor coords fresh for popover positioning
    try {
      const coords = view.coordsAtPos(view.state.selection.from);
      setCursorCoords({ top: coords.top, bottom: coords.bottom, left: coords.left });
    } catch {
      // coordsAtPos can throw at certain node boundaries
    }
    if (!view.state.selection.empty) {
      setSuggestions([]);
      setWikilinkQuery(null);
      wikilinkRangeRef.current = null;
      setEmojiSuggestions([]);
      emojiRangeRef.current = null;
      return;
    }
    const info = getTextBlockInfo(view);
    if (!info) return;
    const { text, offset, startPos } = info;
    const before = text.slice(0, offset);

    // Wikilink autocomplete (triggered by typing [[)
    const wikilinkMatch = before.match(/\[\[([^\]]*)$/);
    if (wikilinkMatch) {
      const query = wikilinkMatch[1];
      const openIdx = before.lastIndexOf("[[");
      wikilinkRangeRef.current = {
        query,
        startPos: startPos + openIdx,
        endPos: view.state.selection.from,
      };
      setSuggestions(filterSummaries(allSummaries, query));
      setWikilinkQuery(query);
      setActiveIdx(0);
      setEmojiSuggestions([]);
      emojiRangeRef.current = null;
      return;
    }

    setSuggestions([]);
    setWikilinkQuery(null);
    wikilinkRangeRef.current = null;

    // Auto-replace completed :shortcode:
    const completedEmoji = before.match(/:([a-z0-9_+-]+):$/);
    if (completedEmoji) {
      const emojiChar = nodeEmoji.get(completedEmoji[1]);
      if (emojiChar) {
        const len = completedEmoji[0].length;
        const replaceStart = startPos + before.length - len;
        const replaceEnd = view.state.selection.from;
        const tr = view.state.tr.replaceWith(
          replaceStart,
          replaceEnd,
          view.state.schema.text(emojiChar)
        );
        view.dispatch(
          tr.setSelection(TextSelection.create(tr.doc, replaceStart + emojiChar.length))
        );
        setEmojiSuggestions([]);
        emojiRangeRef.current = null;
        return;
      }
    }

    // Emoji suggestion dropdown for :partial
    const emojiMatch = before.match(/:([a-z0-9_+-]{2,})$/);
    if (emojiMatch) {
      const query = emojiMatch[1];
      const colonIdx = before.lastIndexOf(":");
      emojiRangeRef.current = {
        startPos: startPos + colonIdx,
        endPos: view.state.selection.from,
      };
      setEmojiSuggestions(nodeEmoji.search(query).slice(0, 8) as EmojiResult[]);
      setEmojiActiveIdx(0);
      return;
    }

    setEmojiSuggestions([]);
    emojiRangeRef.current = null;
  }, [allSummaries]);

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

  const commitEmoji = useCallback((emojiChar: string) => {
    const view = viewRef.current;
    const range = emojiRangeRef.current;
    if (!view || !range) return;
    const { state, dispatch } = view;
    const text = state.schema.text(emojiChar);
    const tr = state.tr.replaceWith(range.startPos, range.endPos, text);
    dispatch(tr.setSelection(TextSelection.create(tr.doc, range.startPos + emojiChar.length)));
    view.focus();
    setEmojiSuggestions([]);
    emojiRangeRef.current = null;
  }, []);

  const commitWikilink = useCallback((note: { id: string; title: string }) => {
    const view = viewRef.current;
    const range = wikilinkRangeRef.current;
    if (!view || !range) return;
    const { state, dispatch } = view;
    const linkMark = state.schema.marks.link?.create({ href: `wikilink:${note.id}` });
    const textNode = state.schema.text(note.title, linkMark ? [linkMark] : []);
    let tr = state.tr.replaceWith(range.startPos, range.endPos, textNode);
    const nextPos = range.startPos + note.title.length;
    tr = tr.setSelection(TextSelection.create(tr.doc, nextPos));
    if (linkMark) tr = tr.removeStoredMark(linkMark.type);
    dispatch(tr);
    view.focus();
    setSuggestions([]);
    setWikilinkQuery(null);
    wikilinkRangeRef.current = null;
  }, []);

  const createAndCommitWikilink = useCallback(
    async (title: string) => {
      try {
        const newId = await api.insertNote(title, "", []);
        setAllSummaries((prev) => [
          ...prev,
          { id: newId, title, created_at: Date.now(), snippet: "" },
        ]);
        commitWikilink({ id: newId, title });
      } catch {
        // If creation fails, still dismiss the autocomplete
        setSuggestions([]);
        setWikilinkQuery(null);
        wikilinkRangeRef.current = null;
      }
    },
    [commitWikilink]
  );

  const commitEditWikilink = useCallback(
    (note: { id: string; title: string }) => {
      const view = viewRef.current;
      if (!view || !editingWikilink) return;
      const { state } = view;
      const linkMark = state.schema.marks.link?.create({ href: `wikilink:${note.id}` });
      const textNode = state.schema.text(note.title, linkMark ? [linkMark] : []);
      const tr = state.tr.replaceWith(editingWikilink.from, editingWikilink.to, textNode);
      view.dispatch(tr);
      view.focus();
      setEditingWikilink(null);
    },
    [editingWikilink]
  );

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      // Let slash provider handle Escape when date picker is shown
      if (slashProviderRef.current?.element.dataset.show === "true" && event.key === "Escape") {
        slashProviderRef.current.hide();
        viewRef.current?.focus();
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
      // Emoji suggestions keyboard handling
      const currentEmojis = emojiSuggestionsRef.current;
      if (currentEmojis.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setEmojiActiveIdx((idx) => (idx + 1) % currentEmojis.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setEmojiActiveIdx((idx) => (idx - 1 + currentEmojis.length) % currentEmojis.length);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          commitEmoji(currentEmojis[emojiActiveIdx].emoji);
          return;
        }
        if (event.key === "Escape") {
          setEmojiSuggestions([]);
          emojiRangeRef.current = null;
          return;
        }
      }
    };
    view.dom.addEventListener("keydown", handleKeyDown);
    return () => view.dom.removeEventListener("keydown", handleKeyDown);
  }, [activeIdx, emojiActiveIdx, commitWikilink, commitEmoji, createAndCommitWikilink]);

  // Show popover below cursor by default; above if cursor is in the lower third
  const popoverBelow = !cursorCoords || cursorCoords.bottom < window.innerHeight * 0.67;
  const POPOVER_WIDTH = 256; // w-64
  const popoverLeft = cursorCoords
    ? Math.min(Math.max(8, cursorCoords.left), window.innerWidth - POPOVER_WIDTH - 8)
    : 0;

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        containerRef.current &&
        !containerRef.current.contains(target)
      ) {
        setSuggestions([]);
        setWikilinkQuery(null);
        wikilinkRangeRef.current = null;
        setEmojiSuggestions([]);
        emojiRangeRef.current = null;
      }
      if (editWikilinkRef.current && !editWikilinkRef.current.contains(target)) {
        setEditingWikilink(null);
      }
      if (datePickerRef.current && !datePickerRef.current.contains(target)) {
        setEditingDate(null);
      }
      if (linkPopoverRef.current && !linkPopoverRef.current.contains(target)) {
        setLinkPopover(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Listen for link button click from bubble menu (bridged via custom event)
  useEffect(() => {
    const handler = (e: Event) => {
      const { from, to, href, rect } = (e as CustomEvent<LinkClickDetail>).detail;
      setLinkPopover({
        from,
        to,
        href,
        rect: { top: rect.top, bottom: rect.bottom, left: rect.left },
        editing: true,
      });
      setLinkPopoverUrl(href);
    };
    document.addEventListener("milkdown-link-click", handler);
    return () => document.removeEventListener("milkdown-link-click", handler);
  }, []);

  // Show pointer cursor on links when Ctrl/Meta is held
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") {
        container.classList.add("ctrl-held");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") {
        container.classList.remove("ctrl-held");
      }
    };
    const onBlur = () => container.classList.remove("ctrl-held");
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Handle date: link clicks — click opens date picker, Ctrl+click navigates
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const findMarkRange = (linkEl: HTMLElement, href: string) => {
      const view = viewRef.current;
      if (!view) return null;
      const pos = view.posAtDOM(linkEl, 0);
      const $pos = view.state.doc.resolve(pos);
      let markFrom = pos;
      let markTo = pos;
      $pos.parent.forEach((child, offset) => {
        const childStart = $pos.start() + offset;
        const childEnd = childStart + child.nodeSize;
        if (child.marks.some((m) => m.type.name === "link" && m.attrs.href === href)) {
          if (childStart <= pos && pos < childEnd) {
            markFrom = childStart;
            markTo = childEnd;
          }
        }
      });
      return { from: markFrom, to: markTo };
    };

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const linkEl = target.closest<HTMLElement>("a[href]");
      if (!linkEl) return;
      const href = linkEl.getAttribute("href");
      if (!href) return;

      const isDate = href.startsWith("date:");
      const isWikilink = href.startsWith("wikilink:");
      const isInternal = isDate || isWikilink;

      if (!isInternal) {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          api.openUrl(href).catch(() => {});
          return;
        }
        e.preventDefault();
        const range = findMarkRange(linkEl, href);
        if (!range) return;
        const rect = linkEl.getBoundingClientRect();
        setLinkPopover({
          ...range,
          href,
          rect: { top: rect.top, bottom: rect.bottom, left: rect.left },
          editing: false,
        });
        setLinkPopoverUrl(href);
        return;
      }

      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        if (isDate) {
          onDateSelectRef.current?.(href.slice("date:".length));
        } else if (isWikilink) {
          const noteId = href.slice("wikilink:".length);
          // ID-based links: navigate directly. Fallback for legacy title-based links.
          if (noteId.length === 36 && noteId.includes("-")) {
            onNavigateRef.current(noteId);
          } else {
            void api
              .getNoteByTitle(noteId)
              .then((linked) => linked && onNavigateRef.current(linked.id))
              .catch(() => {});
          }
        }
        return;
      }

      // Regular click on internal links
      const range = findMarkRange(linkEl, href);
      if (!range) return;
      const rect = linkEl.getBoundingClientRect();

      if (isDate) {
        setEditingDate({
          ...range,
          rect: { top: rect.top, bottom: rect.bottom, left: rect.left },
        });
      } else if (isWikilink) {
        setEditingWikilink({
          ...range,
          rect: { top: rect.top, bottom: rect.bottom, left: rect.left },
        });
        setEditWikilinkQuery("");
        setEditWikilinkActiveIdx(0);
      }
    };
    container.addEventListener("click", handler);
    return () => {
      container.removeEventListener("click", handler);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Milkdown />

      {(suggestions.length > 0 || (wikilinkQuery && wikilinkQuery.trim() !== "")) &&
        cursorCoords && (
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              left: popoverLeft,
              ...(popoverBelow
                ? { top: cursorCoords.bottom + 4 }
                : { bottom: window.innerHeight - cursorCoords.top + 4 }),
            }}
            className="bg-field border bc-ui rounded-md shadow-xl z-50 overflow-hidden max-h-48 overflow-y-auto w-64"
          >
            {suggestions.map((s, index) => {
              const showDisambig = hasDuplicateTitle(suggestions, s.title);
              return (
                <button
                  key={s.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commitWikilink(s);
                  }}
                  onMouseEnter={() => setActiveIdx(index)}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors ${
                    activeIdx === index ? "bg-raised text-hi" : "text-md hover:bg-lift"
                  }`}
                >
                  <FileText size={11} className="text-ghost shrink-0" />
                  <span className="flex flex-col min-w-0">
                    <span className="truncate">{s.title}</span>
                    {showDisambig && (
                      <span className="text-ghost text-[10px] truncate">
                        {formatShortDate(s.created_at)}
                        {s.snippet ? ` — ${s.snippet}` : ""}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
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

      {emojiSuggestions.length > 0 && cursorCoords && (
        <div
          style={{
            position: "fixed",
            left: cursorCoords.left,
            ...(popoverBelow
              ? { top: cursorCoords.bottom + 4 }
              : { bottom: window.innerHeight - cursorCoords.top + 4 }),
          }}
          className="bg-field border bc-ui rounded-md shadow-xl z-50 overflow-hidden max-h-48 overflow-y-auto w-64"
        >
          {emojiSuggestions.map((item, index) => (
            <button
              key={item.name}
              onMouseDown={(e) => {
                e.preventDefault();
                commitEmoji(item.emoji);
              }}
              onMouseEnter={() => setEmojiActiveIdx(index)}
              className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors ${
                emojiActiveIdx === index ? "bg-raised text-hi" : "text-md hover:bg-lift"
              }`}
            >
              <span className="text-base shrink-0">{item.emoji}</span>
              <span className="text-ghost">:{item.name}:</span>
            </button>
          ))}
        </div>
      )}

      {editingDate && (
        <div
          ref={datePickerRef}
          style={{
            position: "fixed",
            left: editingDate.rect.left,
            top: editingDate.rect.bottom + 4,
          }}
          className="z-50"
        >
          <DatePicker
            onSelect={(date) => {
              const view = viewRef.current;
              if (view) {
                const { state } = view;
                const label = formatDateLabel(date);
                const linkMark = state.schema.marks.link?.create({ href: `date:${date}` });
                const textNode = state.schema.text(label, linkMark ? [linkMark] : []);
                let tr = state.tr.replaceWith(editingDate.from, editingDate.to, textNode);
                const nextPos = editingDate.from + label.length;
                tr = tr.setSelection(TextSelection.create(tr.doc, nextPos));
                if (linkMark) tr = tr.removeStoredMark(linkMark.type);
                view.dispatch(tr);
                view.focus();
                onDateLinkedRef.current?.();
              }
              setEditingDate(null);
            }}
            onClose={() => {
              setEditingDate(null);
              viewRef.current?.focus();
            }}
          />
        </div>
      )}

      {editingWikilink && (
        <WikilinkEditPopover
          rect={editingWikilink.rect}
          query={editWikilinkQuery}
          activeIdx={editWikilinkActiveIdx}
          allSummaries={allSummaries}
          popoverRef={editWikilinkRef}
          onQueryChange={(q) => {
            setEditWikilinkQuery(q);
            setEditWikilinkActiveIdx(0);
          }}
          onSelect={commitEditWikilink}
          onClose={() => {
            setEditingWikilink(null);
            viewRef.current?.focus();
          }}
          onActiveIdxChange={setEditWikilinkActiveIdx}
        />
      )}

      {linkPopover && (
        <div
          ref={linkPopoverRef}
          style={{
            position: "fixed",
            left: linkPopover.rect.left,
            top: linkPopover.rect.bottom + 4,
          }}
          className="z-50 bg-field border bc-ui rounded-md shadow-xl overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {!linkPopover.editing ? (
            <div className="flex items-center gap-1 px-1.5 py-1">
              <span className="px-1.5 text-xs text-ghost truncate max-w-48">
                {linkPopover.href}
              </span>
              <button
                title="Edit link"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setLinkPopover({ ...linkPopover, editing: true });
                  setLinkPopoverUrl(linkPopover.href);
                }}
                className="flex items-center justify-center w-6 h-6 rounded text-ghost hover:text-lo hover:bg-raised transition-colors"
              >
                <Pencil size={12} />
              </button>
              <button
                title="Remove link"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const view = viewRef.current;
                  if (view) {
                    const linkType = view.state.schema.marks.link;
                    if (linkType) {
                      const tr = view.state.tr.removeMark(
                        linkPopover.from,
                        linkPopover.to,
                        linkType
                      );
                      view.dispatch(tr);
                    }
                    view.focus();
                  }
                  setLinkPopover(null);
                }}
                className="flex items-center justify-center w-6 h-6 rounded text-ghost hover:text-lo hover:bg-raised transition-colors"
              >
                <Unlink size={12} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-1.5 py-1">
              <input
                ref={(el) => {
                  if (el) requestAnimationFrame(() => el.focus());
                }}
                type="text"
                value={linkPopoverUrl}
                onChange={(e) => setLinkPopoverUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const url = linkPopoverUrl.trim();
                    if (!url) return;
                    const lowerUrl = url.toLowerCase();
                    if (
                      lowerUrl.startsWith("javascript:") ||
                      lowerUrl.startsWith("data:") ||
                      lowerUrl.startsWith("vbscript:")
                    )
                      return;
                    const view = viewRef.current;
                    if (view) {
                      const markType = view.state.schema.marks.link;
                      if (markType) {
                        const mark = markType.create({ href: url });
                        const tr = view.state.tr.addMark(linkPopover.from, linkPopover.to, mark);
                        view.dispatch(tr);
                      }
                      view.focus();
                    }
                    setLinkPopover(null);
                  } else if (e.key === "Escape") {
                    setLinkPopover(null);
                    viewRef.current?.focus();
                  }
                }}
                className="w-48 px-2 py-1 text-xs bg-transparent outline-none text-hi placeholder:text-ghost"
                placeholder="URL…"
              />
              <button
                title="Apply"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const url = linkPopoverUrl.trim();
                  if (!url) return;
                  const lowerUrl = url.toLowerCase();
                  if (
                    lowerUrl.startsWith("javascript:") ||
                    lowerUrl.startsWith("data:") ||
                    lowerUrl.startsWith("vbscript:")
                  )
                    return;
                  const view = viewRef.current;
                  if (view) {
                    const markType = view.state.schema.marks.link;
                    if (markType) {
                      const mark = markType.create({ href: url });
                      const tr = view.state.tr.addMark(linkPopover.from, linkPopover.to, mark);
                      view.dispatch(tr);
                    }
                    view.focus();
                  }
                  setLinkPopover(null);
                }}
                className="flex items-center justify-center w-6 h-6 rounded text-link hover:bg-raised transition-colors"
              >
                <Check size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MilkdownEditor(props: Props) {
  return (
    <MilkdownProvider>
      <MilkdownEditorInner {...props} />
    </MilkdownProvider>
  );
}
