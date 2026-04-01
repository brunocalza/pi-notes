import { describe, it, expect } from "vitest";
import {
  formatDateLabel,
  lucideSvg,
  TOOLBAR_ICONS,
  LANGUAGES,
  parseImageWidth,
  setImageWidth,
  filterTitles,
  filterSummaries,
  hasDuplicateTitle,
  formatShortDate,
} from "./milkdown-utils";

describe("formatDateLabel", () => {
  it("formats an ISO date string to a human-readable label", () => {
    expect(formatDateLabel("2026-03-15")).toBe("Mar 15, 2026");
  });

  it("handles January correctly (month offset)", () => {
    expect(formatDateLabel("2025-01-01")).toBe("Jan 1, 2025");
  });

  it("handles December correctly", () => {
    expect(formatDateLabel("2024-12-31")).toBe("Dec 31, 2024");
  });

  it("handles single-digit day", () => {
    expect(formatDateLabel("2026-06-05")).toBe("Jun 5, 2026");
  });
});

describe("lucideSvg", () => {
  it("builds an SVG string with a single path element", () => {
    const svg = lucideSvg([["path", { d: "M0 0L10 10" }]]);
    expect(svg).toContain("<svg");
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('<path d="M0 0L10 10"/>');
    expect(svg).toContain("</svg>");
  });

  it("builds an SVG string with multiple elements", () => {
    const svg = lucideSvg([
      ["line", { x1: "0", y1: "0", x2: "10", y2: "10" }],
      ["circle", { cx: "5", cy: "5", r: "3" }],
    ]);
    expect(svg).toContain("<line");
    expect(svg).toContain("<circle");
  });

  it("filters out key attribute", () => {
    const svg = lucideSvg([["path", { key: "1", d: "M0 0" }]]);
    expect(svg).not.toContain("key=");
    expect(svg).toContain('d="M0 0"');
  });

  it("sets correct dimensions", () => {
    const svg = lucideSvg([]);
    expect(svg).toContain('width="13"');
    expect(svg).toContain('height="13"');
  });
});

describe("TOOLBAR_ICONS", () => {
  it("contains all expected icon keys", () => {
    expect(Object.keys(TOOLBAR_ICONS)).toEqual(["bold", "italic", "strikethrough", "code", "link"]);
  });

  it("each icon is a valid SVG string", () => {
    for (const [, svg] of Object.entries(TOOLBAR_ICONS)) {
      expect(svg).toMatch(/^<svg.*<\/svg>$/);
    }
  });
});

describe("LANGUAGES", () => {
  it("starts with an empty string for plain text", () => {
    expect(LANGUAGES[0]).toBe("");
  });

  it("contains common languages", () => {
    expect(LANGUAGES).toContain("javascript");
    expect(LANGUAGES).toContain("typescript");
    expect(LANGUAGES).toContain("python");
    expect(LANGUAGES).toContain("rust");
    expect(LANGUAGES).toContain("go");
    expect(LANGUAGES).toContain("sql");
  });

  it("is sorted alphabetically after the empty entry", () => {
    const rest = LANGUAGES.slice(1);
    const sorted = [...rest].sort();
    expect(rest).toEqual(sorted);
  });

  it("has no duplicates", () => {
    expect(new Set(LANGUAGES).size).toBe(LANGUAGES.length);
  });
});

describe("parseImageWidth", () => {
  it("extracts width from ?w=NNN", () => {
    expect(parseImageWidth("attachment:photo.png?w=300")).toBe(300);
  });

  it("extracts width from &w=NNN", () => {
    expect(parseImageWidth("attachment:photo.png?h=200&w=450")).toBe(450);
  });

  it("returns null when no width param", () => {
    expect(parseImageWidth("attachment:photo.png")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseImageWidth("")).toBeNull();
  });

  it("handles width at end of URL", () => {
    expect(parseImageWidth("img.png?w=100")).toBe(100);
  });
});

describe("setImageWidth", () => {
  it("appends width to a URL without query params", () => {
    expect(setImageWidth("attachment:photo.png", 300)).toBe("attachment:photo.png?w=300");
  });

  it("appends width to a URL with existing query params", () => {
    expect(setImageWidth("attachment:photo.png?h=200", 300)).toBe(
      "attachment:photo.png?h=200&w=300"
    );
  });

  it("replaces existing width param", () => {
    expect(setImageWidth("attachment:photo.png?w=100", 500)).toBe("attachment:photo.png?w=500");
  });

  it("rounds fractional widths", () => {
    expect(setImageWidth("img.png", 299.7)).toBe("img.png?w=300");
  });
});

describe("filterTitles", () => {
  const titles = ["My Note", "Another Note", "Meeting Notes", "Recipe", "my diary"];

  it("filters titles by case-insensitive substring match", () => {
    expect(filterTitles(titles, "note")).toEqual(["My Note", "Another Note", "Meeting Notes"]);
  });

  it("returns empty array when no match", () => {
    expect(filterTitles(titles, "zzz")).toEqual([]);
  });

  it("returns all titles for empty query", () => {
    expect(filterTitles(titles, "")).toEqual(titles);
  });

  it("limits results to 8 by default", () => {
    const manyTitles = Array.from({ length: 20 }, (_, i) => `Note ${i}`);
    expect(filterTitles(manyTitles, "Note")).toHaveLength(8);
  });

  it("respects custom limit", () => {
    const manyTitles = Array.from({ length: 20 }, (_, i) => `Note ${i}`);
    expect(filterTitles(manyTitles, "Note", 3)).toHaveLength(3);
  });

  it("is case-insensitive", () => {
    expect(filterTitles(titles, "MY")).toEqual(["My Note", "my diary"]);
  });
});

describe("filterSummaries", () => {
  const summaries = [
    { id: "1", title: "My Note", created_at: 1000, snippet: "" },
    { id: "2", title: "Another Note", created_at: 2000, snippet: "" },
    { id: "3", title: "Recipe", created_at: 3000, snippet: "" },
  ];

  it("filters by title substring", () => {
    const result = filterSummaries(summaries, "note");
    expect(result.map((s) => s.title)).toEqual(["My Note", "Another Note"]);
  });

  it("returns empty for no match", () => {
    expect(filterSummaries(summaries, "zzz")).toEqual([]);
  });

  it("limits to 8 by default", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: `${i}`,
      title: `Note ${i}`,
      created_at: i * 1000,
      snippet: "",
    }));
    expect(filterSummaries(many, "Note")).toHaveLength(8);
  });
});

describe("hasDuplicateTitle", () => {
  it("returns true when title appears more than once", () => {
    const summaries = [
      { id: "1", title: "Foo", created_at: 1000, snippet: "" },
      { id: "2", title: "Foo", created_at: 2000, snippet: "" },
    ];
    expect(hasDuplicateTitle(summaries, "Foo")).toBe(true);
  });

  it("returns false when title is unique", () => {
    const summaries = [
      { id: "1", title: "Foo", created_at: 1000, snippet: "" },
      { id: "2", title: "Bar", created_at: 2000, snippet: "" },
    ];
    expect(hasDuplicateTitle(summaries, "Foo")).toBe(false);
  });
});

describe("formatShortDate", () => {
  it("formats a timestamp", () => {
    const result = formatShortDate(0);
    // Just verify it returns a non-empty string (locale-dependent)
    expect(result.length).toBeGreaterThan(0);
  });
});
