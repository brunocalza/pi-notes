import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Feed from "./Feed";
import { makeNote } from "../test/fixtures";

vi.mock("../api", () => ({
  api: {
    listNotesCursor: vi.fn().mockResolvedValue([]),
    getInboxCursor: vi.fn().mockResolvedValue([]),
    getTrashCursor: vi.fn().mockResolvedValue([]),
    getNotesByTagCursor: vi.fn().mockResolvedValue([]),
    searchNotesCursor: vi.fn().mockResolvedValue([]),
  },
}));

import { api } from "../api";

const defaultProps = {
  view: "all" as const,
  searchQuery: "",
  selectedNoteId: null,
  searchFocusTrigger: 0,
  refreshKey: 0,
  onSearchChange: vi.fn(),
  onSelectNote: vi.fn(),
  onTagClick: vi.fn(),
  onAddNote: vi.fn(),
  onEmptyTrash: vi.fn(),
  onNotesChange: vi.fn(),
};

beforeEach(() => {
  vi.mocked(api.listNotesCursor).mockResolvedValue([]);
  vi.mocked(api.getInboxCursor).mockResolvedValue([]);
  vi.mocked(api.getTrashCursor).mockResolvedValue([]);
  vi.mocked(api.getNotesByTagCursor).mockResolvedValue([]);
  vi.mocked(api.searchNotesCursor).mockResolvedValue([]);
});

describe("Feed", () => {
  it("shows empty state when there are no notes", async () => {
    render(<Feed {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("No notes here")).toBeInTheDocument();
    });
  });

  it("shows 'No results' when search query has no matches", async () => {
    render(<Feed {...defaultProps} searchQuery="xyz" />);
    await waitFor(() => {
      expect(screen.getByText("No results")).toBeInTheDocument();
    });
  });

  it("renders a list of notes", async () => {
    const notes = [makeNote({ id: 1, title: "First" }), makeNote({ id: 2, title: "Second" })];
    vi.mocked(api.listNotesCursor).mockResolvedValue(notes);
    render(<Feed {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument();
      expect(screen.getByText("Second")).toBeInTheDocument();
    });
  });

  it("shows search input for 'all' view", () => {
    render(<Feed {...defaultProps} view="all" />);
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("hides search input for 'trash' view", () => {
    render(<Feed {...defaultProps} view="trash" />);
    expect(screen.queryByPlaceholderText("Search...")).not.toBeInTheDocument();
  });

  it("hides New button in trash view", () => {
    render(<Feed {...defaultProps} view="trash" />);
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  it("shows Empty Trash button in trash view when there are notes", async () => {
    const notes = [makeNote({ id: 1, title: "Old Note" })];
    vi.mocked(api.getTrashCursor).mockResolvedValue(notes);
    render(<Feed {...defaultProps} view="trash" />);
    await waitFor(() => {
      expect(screen.getByText("Empty Trash")).toBeInTheDocument();
    });
  });

  it("hides Empty Trash button when trash is empty", async () => {
    render(<Feed {...defaultProps} view="trash" />);
    await waitFor(() => {
      expect(screen.queryByText("Empty Trash")).not.toBeInTheDocument();
    });
  });

  it("calls onEmptyTrash when Empty Trash is clicked", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onEmptyTrash = vi.fn();
    const notes = [makeNote({ id: 1, title: "Old Note" })];
    vi.mocked(api.getTrashCursor).mockResolvedValue(notes);
    render(<Feed {...defaultProps} view="trash" onEmptyTrash={onEmptyTrash} />);
    await waitFor(() => {
      expect(screen.getByText("Empty Trash")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Empty Trash"));
    expect(onEmptyTrash).toHaveBeenCalledOnce();
  });

  it("calls onAddNote when New button is clicked", async () => {
    const onAddNote = vi.fn();
    render(<Feed {...defaultProps} onAddNote={onAddNote} />);
    await userEvent.click(screen.getByText("New"));
    expect(onAddNote).toHaveBeenCalledOnce();
  });

  it("calls onSearchChange when typing in the search box", async () => {
    const onSearchChange = vi.fn();
    render(<Feed {...defaultProps} onSearchChange={onSearchChange} />);
    await userEvent.type(screen.getByPlaceholderText("Search..."), "hello");
    expect(onSearchChange).toHaveBeenCalled();
  });

  it("calls onSelectNote when a note is clicked", async () => {
    const onSelectNote = vi.fn();
    const notes = [makeNote({ id: 42, title: "Click Me" })];
    vi.mocked(api.listNotesCursor).mockResolvedValue(notes);
    render(<Feed {...defaultProps} onSelectNote={onSelectNote} />);
    await waitFor(() => {
      expect(screen.getByText("Click Me")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Click Me"));
    expect(onSelectNote).toHaveBeenCalledWith(42);
  });

  it("shows view title based on current view", async () => {
    const { rerender } = render(<Feed {...defaultProps} view="inbox" />);
    expect(screen.getByText("Inbox")).toBeInTheDocument();

    rerender(<Feed {...defaultProps} view="trash" />);
    expect(screen.getByText("Trash")).toBeInTheDocument();

    rerender(<Feed {...defaultProps} view={{ tag: "react" }} />);
    expect(screen.getByText("#react")).toBeInTheDocument();
  });
});
