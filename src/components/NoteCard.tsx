import { Note } from "../types";

interface Props {
  note: Note;
  selected: boolean;
  onClick: () => void;
  onTagClick: (tag: string) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/^\s*[-*+]\s/gm, "")
    .replace(/^\s*\d+\.\s/gm, "")
    .replace(/\n+/g, " ")
    .trim();
}

export default function NoteCard({ note, selected, onClick, onTagClick }: Props) {
  const snippet = stripMarkdown(note.content).slice(0, 120);

  return (
    <div
      onClick={onClick}
      className={`relative px-4 py-4 cursor-pointer border-b bc-subtle transition-colors ${
        selected ? "bg-raised" : "hover:bg-field"
      }`}
    >
      {selected && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--c-link)]" />
      )}

      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className={`text-sm font-semibold leading-snug truncate flex-1 ${selected ? "text-hi" : "text-md"}`}>
          {note.title || <span className="text-ghost italic font-normal">Untitled</span>}
        </h3>
        <span className="text-[10px] text-ghost shrink-0">{formatDate(note.created_at)}</span>
      </div>

      {snippet && (
        <p className="text-xs text-dim leading-relaxed line-clamp-2 mb-2">{snippet}</p>
      )}

      {note.tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {note.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              onClick={(e) => { e.stopPropagation(); onTagClick(tag); }}
              className="text-[10px] text-ghost hover:text-lo cursor-pointer transition-colors"
            >
              #{tag}
            </span>
          ))}
          {note.tags.length > 4 && (
            <span className="text-[10px] text-ghost">+{note.tags.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
}
