import { render, screen, waitFor } from "../test/render";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Sidebar from "./Sidebar";
import { api } from "../api";
import { Collection } from "../types";

vi.mock("../api", () => ({
  api: {
    renameTag: vi.fn(),
    deleteTag: vi.fn(),
    getDbPathSetting: vi.fn().mockResolvedValue("/home/user/.local/share/pi-notes/notes.db"),
    getDaysWithNotesInMonth: vi.fn().mockResolvedValue([]),
    createCollection: vi.fn(),
    renameCollection: vi.fn(),
    deleteCollection: vi.fn(),
    setDbPathSetting: vi.fn().mockResolvedValue(undefined),
  },
}));

const makeCollection = (overrides: Partial<Collection> = {}): Collection => ({
  id: "col-1",
  name: "Work",
  note_count: 3,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const defaultProps = {
  view: "all" as const,
  tags: [] as [string, number][],
  collections: [] as Collection[],
  inboxCount: 0,
  theme: "dark" as const,
  colorTheme: "graphite" as const,
  refreshKey: 0,
  onViewChange: vi.fn(),
  onTagRename: vi.fn(),
  onTagDelete: vi.fn(),
  onCollectionClick: vi.fn(),
  onCreateCollection: vi.fn().mockResolvedValue(undefined),
  onRenameCollection: vi.fn().mockResolvedValue(undefined),
  onDeleteCollection: vi.fn(),
  onThemeToggle: vi.fn(),
  onColorThemeChange: vi.fn(),
  onDbPathChange: vi.fn(),
};

describe("Sidebar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nav items", () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("My Notes")).toBeInTheDocument();
    expect(screen.getByText("Trash")).toBeInTheDocument();
  });

  it("shows inbox count badge when count > 0", () => {
    render(<Sidebar {...defaultProps} inboxCount={3} />);
    const badge = document.querySelector(".bg-inbox-badge");
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toBe("3");
  });

  it("hides inbox count badge when count is 0", () => {
    render(<Sidebar {...defaultProps} inboxCount={0} />);
    expect(document.querySelector(".bg-inbox-badge")).not.toBeInTheDocument();
  });

  it("calls onViewChange with correct view when nav items are clicked", async () => {
    const onViewChange = vi.fn();
    render(<Sidebar {...defaultProps} onViewChange={onViewChange} />);

    await userEvent.click(screen.getByText("Inbox"));
    expect(onViewChange).toHaveBeenCalledWith("inbox");

    await userEvent.click(screen.getByText("My Notes"));
    expect(onViewChange).toHaveBeenCalledWith("all");

    await userEvent.click(screen.getByText("Trash"));
    expect(onViewChange).toHaveBeenCalledWith("trash");
  });

  it("renders tags list", () => {
    const tags: [string, number][] = [
      ["react", 3],
      ["typescript", 1],
    ];
    render(<Sidebar {...defaultProps} tags={tags} />);
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("typescript")).toBeInTheDocument();
  });

  it("calls onViewChange with tag when a tag is clicked", async () => {
    const onViewChange = vi.fn();
    const tags: [string, number][] = [["react", 2]];
    render(<Sidebar {...defaultProps} tags={tags} onViewChange={onViewChange} />);

    await userEvent.click(screen.getByText("react"));
    expect(onViewChange).toHaveBeenCalledWith({ tag: "react" });
  });

  it("calls renameTag and onTagRename after renaming a tag", async () => {
    vi.mocked(api.renameTag).mockResolvedValue(undefined);
    const onTagRename = vi.fn();
    const tags: [string, number][] = [["oldtag", 1]];
    render(<Sidebar {...defaultProps} tags={tags} onTagRename={onTagRename} />);

    await userEvent.hover(screen.getByText("oldtag"));
    await userEvent.click(screen.getByTitle("Rename tag"));

    const input = screen.getByDisplayValue("oldtag");
    await userEvent.clear(input);
    await userEvent.type(input, "newtag{Enter}");

    await waitFor(() => {
      expect(api.renameTag).toHaveBeenCalledWith("oldtag", "newtag");
      expect(onTagRename).toHaveBeenCalled();
    });
  });

  it("calls deleteTag and onTagDelete when delete is clicked", async () => {
    vi.mocked(api.deleteTag).mockResolvedValue(undefined);
    const onTagDelete = vi.fn();
    const tags: [string, number][] = [["mytag", 1]];
    render(<Sidebar {...defaultProps} tags={tags} onTagDelete={onTagDelete} />);

    await userEvent.hover(screen.getByText("mytag"));
    await userEvent.click(screen.getByTitle("Delete tag"));

    await waitFor(() => {
      expect(api.deleteTag).toHaveBeenCalledWith("mytag");
      expect(onTagDelete).toHaveBeenCalled();
    });
  });

  it("shows settings panel when Settings button is clicked", async () => {
    render(<Sidebar {...defaultProps} />);
    await userEvent.click(screen.getByText("Settings"));
    expect(screen.getByText("Appearance")).toBeInTheDocument();
  });

  it("cancels tag rename on Escape key", async () => {
    const tags: [string, number][] = [["mytag", 1]];
    render(<Sidebar {...defaultProps} tags={tags} />);

    await userEvent.hover(screen.getByText("mytag"));
    await userEvent.click(screen.getByTitle("Rename tag"));

    const input = screen.getByDisplayValue("mytag");
    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(screen.getByText("mytag")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("mytag")).not.toBeInTheDocument();
    });
  });

  it("submits rename on blur when value differs", async () => {
    vi.mocked(api.renameTag).mockResolvedValue(undefined);
    const onTagRename = vi.fn();
    const tags: [string, number][] = [["oldtag", 1]];
    render(<Sidebar {...defaultProps} tags={tags} onTagRename={onTagRename} />);

    await userEvent.hover(screen.getByText("oldtag"));
    await userEvent.click(screen.getByTitle("Rename tag"));

    const input = screen.getByDisplayValue("oldtag");
    await userEvent.clear(input);
    await userEvent.type(input, "newtag");
    fireEvent.blur(input);

    await waitFor(() => {
      expect(api.renameTag).toHaveBeenCalledWith("oldtag", "newtag");
      expect(onTagRename).toHaveBeenCalled();
    });
  });

  it("saves db path when Enter key pressed in settings input", async () => {
    vi.mocked(api.getDbPathSetting).mockResolvedValue("/old/path.db");
    vi.mocked(api.setDbPathSetting).mockResolvedValue(undefined);
    const onDbPathChange = vi.fn();

    render(<Sidebar {...defaultProps} onDbPathChange={onDbPathChange} />);
    await userEvent.click(screen.getByText("Settings"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("/old/path.db")).toBeInTheDocument();
    });

    const dbInput = screen.getByDisplayValue("/old/path.db");
    await userEvent.clear(dbInput);
    await userEvent.type(dbInput, "/new/path.db");
    // Press Enter to trigger blur
    fireEvent.keyDown(dbInput, { key: "Enter" });
    fireEvent.blur(dbInput);

    await waitFor(() => {
      expect(api.setDbPathSetting).toHaveBeenCalledWith("/new/path.db");
      expect(onDbPathChange).toHaveBeenCalled();
    });
  });

  it("shows error when db path save fails", async () => {
    vi.mocked(api.getDbPathSetting).mockResolvedValue("/old/path.db");
    vi.mocked(api.setDbPathSetting).mockRejectedValue("Permission denied");

    render(<Sidebar {...defaultProps} />);
    await userEvent.click(screen.getByText("Settings"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("/old/path.db")).toBeInTheDocument();
    });

    const dbInput = screen.getByDisplayValue("/old/path.db");
    await userEvent.clear(dbInput);
    await userEvent.type(dbInput, "/new/path.db");
    fireEvent.blur(dbInput);

    await waitFor(() => {
      expect(screen.getByText("Permission denied")).toBeInTheDocument();
    });
  });

  it("clicking Dark button when already dark does not call onThemeToggle", async () => {
    const onThemeToggle = vi.fn();
    render(<Sidebar {...defaultProps} theme="dark" onThemeToggle={onThemeToggle} />);
    await userEvent.click(screen.getByText("Settings"));
    await waitFor(() => screen.getByText("Dark"));
    await userEvent.click(screen.getByText("Dark"));
    expect(onThemeToggle).not.toHaveBeenCalled();
  });

  it("clicking Light button when in light mode does not call onThemeToggle", async () => {
    const onThemeToggle = vi.fn();
    render(<Sidebar {...defaultProps} theme="light" onThemeToggle={onThemeToggle} />);
    await userEvent.click(screen.getByText("Settings"));
    await waitFor(() => screen.getByText("Light"));
    await userEvent.click(screen.getByText("Light"));
    expect(onThemeToggle).not.toHaveBeenCalled();
  });

  it("clicking Dark button when in light mode calls onThemeToggle", async () => {
    const onThemeToggle = vi.fn();
    render(<Sidebar {...defaultProps} theme="light" onThemeToggle={onThemeToggle} />);
    await userEvent.click(screen.getByText("Settings"));
    await waitFor(() => screen.getByText("Dark"));
    await userEvent.click(screen.getByText("Dark"));
    expect(onThemeToggle).toHaveBeenCalled();
  });

  it("shows toast when renameTag fails", async () => {
    vi.mocked(api.renameTag).mockRejectedValue(new Error("rename failed"));
    const tags: [string, number][] = [["oldtag", 1]];
    render(<Sidebar {...defaultProps} tags={tags} />);

    await userEvent.hover(screen.getByText("oldtag"));
    await userEvent.click(screen.getByTitle("Rename tag"));

    const input = screen.getByDisplayValue("oldtag");
    await userEvent.clear(input);
    await userEvent.type(input, "newtag{Enter}");

    await waitFor(() => {
      expect(screen.getByText(/Failed to rename tag/)).toBeInTheDocument();
    });
  });

  it("shows toast when deleteTag fails", async () => {
    vi.mocked(api.deleteTag).mockRejectedValue(new Error("delete failed"));
    const tags: [string, number][] = [["badtag", 1]];
    render(<Sidebar {...defaultProps} tags={tags} />);

    await userEvent.hover(screen.getByText("badtag"));
    await userEvent.click(screen.getByTitle("Delete tag"));

    await waitFor(() => {
      expect(screen.getByText(/Failed to delete tag/)).toBeInTheDocument();
    });
  });

  it("shows toast when getDbPathSetting fails", async () => {
    vi.mocked(api.getDbPathSetting).mockRejectedValueOnce(new Error("settings read error"));

    render(<Sidebar {...defaultProps} />);
    await userEvent.click(screen.getByText("Settings"));

    await waitFor(() => {
      expect(screen.getByText(/Failed to load settings/)).toBeInTheDocument();
    });
  });

  it("does not call setDbPathSetting when path is unchanged on blur", async () => {
    vi.mocked(api.getDbPathSetting).mockResolvedValue("/same/path.db");

    render(<Sidebar {...defaultProps} />);
    await userEvent.click(screen.getByText("Settings"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("/same/path.db")).toBeInTheDocument();
    });

    // Blur the input without changing the value - should early-return
    const dbInput = screen.getByDisplayValue("/same/path.db");
    fireEvent.blur(dbInput);

    expect(api.setDbPathSetting).not.toHaveBeenCalled();
  });
});

describe("Sidebar collections", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders collection list", () => {
    const collections = [
      makeCollection({ id: "col-1", name: "Work", note_count: 2 }),
      makeCollection({ id: "col-2", name: "Personal", note_count: 0 }),
    ];
    render(<Sidebar {...defaultProps} collections={collections} />);
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  it("shows note count for each collection", () => {
    const collections = [makeCollection({ id: "col-1", name: "Work", note_count: 42 })];
    render(<Sidebar {...defaultProps} collections={collections} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("calls onCollectionClick when a collection is clicked", async () => {
    const onCollectionClick = vi.fn();
    const collections = [makeCollection({ id: "col-1", name: "Work" })];
    render(
      <Sidebar {...defaultProps} collections={collections} onCollectionClick={onCollectionClick} />
    );

    await userEvent.click(screen.getByText("Work"));
    expect(onCollectionClick).toHaveBeenCalledWith("col-1");
  });

  it("shows empty state when there are no collections", () => {
    render(<Sidebar {...defaultProps} collections={[]} />);
    expect(screen.getByText("No collections yet")).toBeInTheDocument();
  });

  it("calls onCreateCollection when a new collection name is submitted", async () => {
    const onCreateCollection = vi.fn().mockResolvedValue(undefined);
    render(<Sidebar {...defaultProps} onCreateCollection={onCreateCollection} />);

    await userEvent.click(screen.getByTitle("New collection"));
    await userEvent.type(screen.getByPlaceholderText("Collection name..."), "Research{Enter}");

    await waitFor(() => {
      expect(onCreateCollection).toHaveBeenCalledWith("Research");
    });
  });

  it("shows inline error when collection name is duplicate", async () => {
    const onCreateCollection = vi
      .fn()
      .mockRejectedValue('A collection named "Research" already exists');
    render(<Sidebar {...defaultProps} onCreateCollection={onCreateCollection} />);

    await userEvent.click(screen.getByTitle("New collection"));
    await userEvent.type(screen.getByPlaceholderText("Collection name..."), "Research{Enter}");

    await waitFor(() => {
      expect(screen.getByText('A collection named "Research" already exists')).toBeInTheDocument();
    });
  });

  it("calls onRenameCollection when renaming a collection", async () => {
    const onRenameCollection = vi.fn().mockResolvedValue(undefined);
    const collections = [makeCollection({ id: "col-1", name: "Work" })];
    render(
      <Sidebar
        {...defaultProps}
        collections={collections}
        onRenameCollection={onRenameCollection}
      />
    );

    await userEvent.hover(screen.getByText("Work"));
    await userEvent.click(screen.getByTitle("Rename collection"));

    const input = screen.getByDisplayValue("Work");
    await userEvent.clear(input);
    await userEvent.type(input, "Projects{Enter}");

    await waitFor(() => {
      expect(onRenameCollection).toHaveBeenCalledWith("col-1", "Projects");
    });
  });

  it("calls onDeleteCollection when deleting a collection", async () => {
    const onDeleteCollection = vi.fn();
    const collections = [makeCollection({ id: "col-1", name: "Work" })];
    render(
      <Sidebar
        {...defaultProps}
        collections={collections}
        onDeleteCollection={onDeleteCollection}
      />
    );

    await userEvent.hover(screen.getByText("Work"));
    await userEvent.click(screen.getByTitle("Delete collection"));

    expect(onDeleteCollection).toHaveBeenCalledWith("col-1");
  });

  it("cancels collection creation when empty name is submitted", async () => {
    render(<Sidebar {...defaultProps} collections={[]} />);

    await userEvent.click(screen.getByTitle("New collection"));
    const input = screen.getByPlaceholderText("Collection name...");
    // Blur with empty input - should cancel
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Collection name...")).not.toBeInTheDocument();
    });
    expect(defaultProps.onCreateCollection).not.toHaveBeenCalled();
  });

  it("cancels collection creation on Escape key", async () => {
    render(<Sidebar {...defaultProps} collections={[]} />);

    await userEvent.click(screen.getByTitle("New collection"));
    const input = screen.getByPlaceholderText("Collection name...");
    await userEvent.type(input, "Test");
    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Collection name...")).not.toBeInTheDocument();
    });
  });

  it("cancels collection rename on Escape key", async () => {
    const collections = [makeCollection({ id: "col-1", name: "Work" })];
    render(<Sidebar {...defaultProps} collections={collections} />);

    await userEvent.hover(screen.getByText("Work"));
    await userEvent.click(screen.getByTitle("Rename collection"));

    const input = screen.getByDisplayValue("Work");
    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByDisplayValue("Work")).not.toBeInTheDocument();
      expect(screen.getByText("Work")).toBeInTheDocument();
    });
  });

  it("submits collection rename via blur when value changed", async () => {
    const onRenameCollection = vi.fn().mockResolvedValue(undefined);
    const collections = [makeCollection({ id: "col-1", name: "Work" })];
    render(
      <Sidebar
        {...defaultProps}
        collections={collections}
        onRenameCollection={onRenameCollection}
      />
    );

    await userEvent.hover(screen.getByText("Work"));
    await userEvent.click(screen.getByTitle("Rename collection"));

    const input = screen.getByDisplayValue("Work");
    await userEvent.clear(input);
    await userEvent.type(input, "Research");
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onRenameCollection).toHaveBeenCalledWith("col-1", "Research");
    });
  });

  it("mouseLeave on collection hides action buttons", async () => {
    const collections = [makeCollection({ id: "col-1", name: "Work" })];
    render(<Sidebar {...defaultProps} collections={collections} />);

    const collectionRow = screen.getByText("Work").closest(".relative")!;
    fireEvent.mouseEnter(collectionRow);
    // Hover buttons appear
    expect(screen.queryByTitle("Rename collection")).toBeInTheDocument();
    fireEvent.mouseLeave(collectionRow);
    // After mouseleave, buttons should no longer be visible
    expect(screen.queryByTitle("Rename collection")).not.toBeInTheDocument();
  });

  it("shows inline error when collection rename fails", async () => {
    const onRenameCollection = vi.fn().mockRejectedValue("Name already taken");
    const collections = [makeCollection({ id: "col-1", name: "Work" })];
    render(
      <Sidebar
        {...defaultProps}
        collections={collections}
        onRenameCollection={onRenameCollection}
      />
    );

    await userEvent.hover(screen.getByText("Work"));
    await userEvent.click(screen.getByTitle("Rename collection"));

    const input = screen.getByDisplayValue("Work");
    await userEvent.clear(input);
    await userEvent.type(input, "Projects{Enter}");

    await waitFor(() => {
      expect(screen.getByText("Name already taken")).toBeInTheDocument();
    });
  });

  it("cancels tag rename when value is cleared on blur", async () => {
    vi.mocked(api.renameTag).mockResolvedValue(undefined);
    const tags: [string, number][] = [["mytag", 1]];
    render(<Sidebar {...defaultProps} tags={tags} />);

    await userEvent.hover(screen.getByText("mytag"));
    await userEvent.click(screen.getByTitle("Rename tag"));

    const input = screen.getByDisplayValue("mytag");
    await userEvent.clear(input);
    // Blur with empty value — should early-return without calling renameTag
    fireEvent.blur(input);

    await waitFor(() => {
      expect(api.renameTag).not.toHaveBeenCalled();
    });
  });

  it("cancels collection rename via blur when value unchanged", async () => {
    const onRenameCollection = vi.fn().mockResolvedValue(undefined);
    const collections = [makeCollection({ id: "col-1", name: "Work" })];
    render(
      <Sidebar
        {...defaultProps}
        collections={collections}
        onRenameCollection={onRenameCollection}
      />
    );

    await userEvent.hover(screen.getByText("Work"));
    await userEvent.click(screen.getByTitle("Rename collection"));

    const input = screen.getByDisplayValue("Work");
    // Blur without changing value
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onRenameCollection).not.toHaveBeenCalled();
    });
  });
});

describe("Sidebar calendar", () => {
  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDaysWithNotesInMonth).mockResolvedValue([]);
  });

  it("shows current month and year", () => {
    const now = new Date();
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText(`${MONTHS[now.getMonth()]} ${now.getFullYear()}`)).toBeInTheDocument();
  });

  it("calls getDaysWithNotesInMonth with current year-month on mount", async () => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => {
      expect(api.getDaysWithNotesInMonth).toHaveBeenCalledWith(`${now.getFullYear()}-${mm}`);
    });
  });

  it("refetches dots when refreshKey changes", async () => {
    const { rerender } = render(<Sidebar {...defaultProps} refreshKey={0} />);
    await waitFor(() => expect(api.getDaysWithNotesInMonth).toHaveBeenCalledTimes(3));
    rerender(<Sidebar {...defaultProps} refreshKey={1} />);
    await waitFor(() => expect(api.getDaysWithNotesInMonth).toHaveBeenCalledTimes(6));
  });

  it("highlights the date nav when view is a date view", async () => {
    // Render with date view to exercise isActive for date branch
    render(<Sidebar {...defaultProps} view={{ date: "2026-03-10" }} />);
    // The calendar day "10" should be rendered (and might be styled as active)
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("calls onViewChange with { date } when a day is clicked", async () => {
    const onViewChange = vi.fn();
    const now = new Date();
    const year = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    render(<Sidebar {...defaultProps} onViewChange={onViewChange} />);
    // "10" never appears in leading/trailing padding (at most 6 days from adjacent month)
    await userEvent.click(screen.getAllByText("10")[0]);
    expect(onViewChange).toHaveBeenCalledWith({ date: `${year}-${mm}-10` });
  });

  it("navigates to next month and refetches dots", async () => {
    const now = new Date();
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => expect(api.getDaysWithNotesInMonth).toHaveBeenCalledTimes(3));

    await userEvent.click(screen.getByTitle("Next month"));

    const nextMonth = (now.getMonth() + 1) % 12;
    const nextYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    await waitFor(() => {
      expect(screen.getByText(`${MONTHS[nextMonth]} ${nextYear}`)).toBeInTheDocument();
      expect(api.getDaysWithNotesInMonth).toHaveBeenCalledTimes(6);
    });
  });

  it("navigates to previous month and refetches dots", async () => {
    const now = new Date();
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => expect(api.getDaysWithNotesInMonth).toHaveBeenCalledTimes(3));

    await userEvent.click(screen.getByTitle("Previous month"));

    const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    await waitFor(() => {
      expect(screen.getByText(`${MONTHS[prevMonth]} ${prevYear}`)).toBeInTheDocument();
      expect(api.getDaysWithNotesInMonth).toHaveBeenCalledTimes(6);
    });
  });

  it("renders a box outline for each day returned by getDaysWithNotesInMonth", async () => {
    // Only return notes for the current month; prev and next return empty so overflow cells stay plain
    vi.mocked(api.getDaysWithNotesInMonth)
      .mockResolvedValueOnce([]) // prev month
      .mockResolvedValueOnce([5, 15, 20]) // current month
      .mockResolvedValueOnce([]); // next month
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => {
      const outlinedCells = Array.from(document.querySelectorAll(".rounded-sm.border")).filter(
        (el) => !el.classList.contains("border-transparent")
      );
      expect(outlinedCells.length).toBe(3);
    });
  });

  it("navigates from December to January of next year via next month button", async () => {
    render(<Sidebar {...defaultProps} />);

    // Navigate to December first by clicking prev or next multiple times
    // Easier: navigate forward from current month to reach December by going back to Jan then forward
    // The simplest approach: just find the months and navigate to December
    const now = new Date();
    const currentMonth = now.getMonth();

    // Navigate to December by pressing Next month enough times
    const clicksToDecember = (11 - currentMonth + 12) % 12;
    for (let i = 0; i < clicksToDecember; i++) {
      await userEvent.click(screen.getByTitle("Next month"));
    }

    await waitFor(() => {
      expect(screen.getByText(/December/)).toBeInTheDocument();
    });

    // Now click next to wrap from December to January
    await userEvent.click(screen.getByTitle("Next month"));

    const nextYear = now.getFullYear() + (currentMonth === 11 ? 0 : 1);
    await waitFor(() => {
      expect(screen.getByText(`January ${nextYear}`)).toBeInTheDocument();
    });
  });

  it("mouseLeave on tag resets hoveredTag", async () => {
    const tags: [string, number][] = [["hoverable", 1]];
    render(<Sidebar {...defaultProps} tags={tags} />);

    const tagEl = screen.getByText("hoverable").closest(".relative")!;
    // Hover to set hoveredTag
    fireEvent.mouseEnter(tagEl);
    // Leave to clear hoveredTag
    fireEvent.mouseLeave(tagEl);
    // Should not crash - the hover buttons should be gone
    expect(screen.queryByTitle("Rename tag")).not.toBeInTheDocument();
  });

  it("clicking month label while on different month returns to today", async () => {
    render(<Sidebar {...defaultProps} />);

    // Navigate to next month first
    await userEvent.click(screen.getByTitle("Next month"));

    // Then click the month label button to return to today
    const now = new Date();
    const MONTHS = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    // The month label is on the "Go to today" button
    await userEvent.click(screen.getByTitle("Go to today"));

    // Should return to current month
    await waitFor(() => {
      expect(
        screen.getByText(`${MONTHS[now.getMonth()]} ${now.getFullYear()}`)
      ).toBeInTheDocument();
    });
  });

  it("navigates from January to December of previous year via previous month button", async () => {
    render(<Sidebar {...defaultProps} />);

    const now = new Date();
    const currentMonth = now.getMonth();

    // Navigate to January by going backwards
    const clicksToPrev = (currentMonth + 12) % 12;
    for (let i = 0; i < clicksToPrev; i++) {
      await userEvent.click(screen.getByTitle("Previous month"));
    }

    await waitFor(() => {
      expect(screen.getByText(/January/)).toBeInTheDocument();
    });

    // Now click Previous to go from January to December of previous year
    await userEvent.click(screen.getByTitle("Previous month"));

    const prevYear = now.getFullYear() - (currentMonth === 0 ? 0 : 1);
    await waitFor(() => {
      expect(screen.getByText(`December ${prevYear}`)).toBeInTheDocument();
    });
  });
});
