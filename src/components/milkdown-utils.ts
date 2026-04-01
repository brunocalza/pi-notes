/**
 * Pure utility functions extracted from MilkdownEditor for testability.
 */

export function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Build an SVG string matching Lucide's viewBox/stroke style. */
export function lucideSvg(paths: Array<[string, Record<string, string>]>): string {
  const inner = paths
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== "key")
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      return `<${tag} ${a}/>`;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

export const TOOLBAR_ICONS = {
  bold: lucideSvg([
    [
      "path",
      {
        d: "M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8",
      },
    ],
  ]),
  italic: lucideSvg([
    ["line", { x1: "19", x2: "10", y1: "4", y2: "4" }],
    ["line", { x1: "14", x2: "5", y1: "20", y2: "20" }],
    ["line", { x1: "15", x2: "9", y1: "4", y2: "20" }],
  ]),
  strikethrough: lucideSvg([
    ["path", { d: "M16 4H9a3 3 0 0 0-2.83 4" }],
    ["path", { d: "M14 12a4 4 0 0 1 0 8H6" }],
    ["line", { x1: "4", x2: "20", y1: "12", y2: "12" }],
  ]),
  code: lucideSvg([
    ["path", { d: "m16 18 6-6-6-6" }],
    ["path", { d: "m8 6-6 6 6 6" }],
  ]),
  link: lucideSvg([
    ["path", { d: "M9 17H7A5 5 0 0 1 7 7h2" }],
    ["path", { d: "M15 7h2a5 5 0 1 1 0 10h-2" }],
    ["line", { x1: "8", x2: "16", y1: "12", y2: "12" }],
  ]),
};

export const LANGUAGES = [
  "",
  "bash",
  "c",
  "cpp",
  "css",
  "go",
  "html",
  "java",
  "javascript",
  "json",
  "kotlin",
  "lua",
  "markdown",
  "python",
  "ruby",
  "rust",
  "shell",
  "sql",
  "toml",
  "typescript",
  "xml",
  "yaml",
];

/** Parse ?w=NNN from an image src URL. */
export function parseImageWidth(src: string): number | null {
  const match = src.match(/[?&]w=(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/** Strip existing width param from a URL and append a new one. */
export function setImageWidth(src: string, width: number): string {
  const base = src.replace(/([?&])w=\d+/, "");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}w=${Math.round(width)}`;
}

/** Filter note titles by query, returning up to `limit` results. */
export function filterTitles(allTitles: string[], query: string, limit = 8): string[] {
  return allTitles.filter((t) => t.toLowerCase().includes(query.toLowerCase())).slice(0, limit);
}

import type { NoteSummary } from "../types";

/** Filter note summaries by title query, returning up to `limit` results. */
export function filterSummaries(
  allSummaries: NoteSummary[],
  query: string,
  limit = 8
): NoteSummary[] {
  return allSummaries
    .filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, limit);
}

/** Check if a title appears more than once in a list of summaries. */
export function hasDuplicateTitle(summaries: NoteSummary[], title: string): boolean {
  return summaries.filter((s) => s.title === title).length > 1;
}

/** Format a millisecond timestamp as a short date string for disambiguation. */
export function formatShortDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
