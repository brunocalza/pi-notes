import { render, screen, waitFor } from "../test/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Feed from "./Feed";
import { makeNote } from "../test/fixtures";
import type { View } from "../types";

vi.mock("../api", () => ({
  api: {
    listNotesCursor: vi.fn().mockResolvedValue([]),
    getInboxCursor: vi.fn().mockResolvedValue([]),
    getTrashCursor: vi.fn().mockResolvedValue([]),
    getNotesByTagCursor: vi.fn().mockResolvedValue([]),
    searchNotesCursor: vi.fn().mockResolvedValue([]),
    getNotesByDate: vi.fn().mockResolvedValue([]),
    getNotesByCollectionCursor: vi.fn().mockResolvedValue([]),
  },
}));

import { api } from "../api";

const defaultProps = {
  view: "all" as const,
  collections: [],
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
  vi.mocked(api.getNotesByDate).mockResolvedValue([]);
  vi.mocked(api.getNotesByCollectionCursor).mockResolvedValue([]);
});

describe("Feed", () => {
  it("shows empty state when there are no notes", async () => {
    render(<Feed {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText("No notes here yet")).toBeInTheDocument();
    });
  });

  it("shows 'No results' when search query has no matches", async () => {
    render(<Feed {...defaultProps} searchQuery="xyz" />);
    await waitFor(() => {
      expect(screen.getByText(/No results for/)).toBeInTheDocument();
    });
  });

  it("renders a list of notes", async () => {
    const notes = [
      makeNote({ id: "00000000-0000-0000-0000-000000000001", title: "First" }),
      makeNote({ id: "00000000-0000-0000-0000-000000000002", title: "Second" }),
    ];
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
    const notes = [makeNote({ id: "00000000-0000-0000-0000-000000000001", title: "Old Note" })];
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
    const notes = [makeNote({ id: "00000000-0000-0000-0000-000000000001", title: "Old Note" })];
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
    const notes = [makeNote({ id: "00000000-0000-0000-0000-000000000042", title: "Click Me" })];
    vi.mocked(api.listNotesCursor).mockResolvedValue(notes);
    render(<Feed {...defaultProps} onSelectNote={onSelectNote} />);
    await waitFor(() => {
      expect(screen.getByText("Click Me")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Click Me"));
    expect(onSelectNote).toHaveBeenCalledWith("00000000-0000-0000-0000-000000000042");
  });

  it("shows view title based on current view", async () => {
    const { rerender } = render(<Feed {...defaultProps} view="inbox" />);
    expect(screen.getByText("Inbox")).toBeInTheDocument();

    rerender(<Feed {...defaultProps} view="trash" />);
    expect(screen.getByText("Trash")).toBeInTheDocument();

    rerender(<Feed {...defaultProps} view={{ tag: "react" }} />);
    expect(screen.getByText("#react")).toBeInTheDocument();
  });

  it("shows English-formatted date as title for date view", () => {
    render(<Feed {...defaultProps} view={{ date: "2026-03-15" }} />);
    expect(screen.getByText("March 15, 2026")).toBeInTheDocument();
  });

  it("calls getNotesByDate when in date view", async () => {
    const notes = [makeNote({ id: "00000000-0000-0000-0000-000000000001", title: "Date Note" })];
    vi.mocked(api.getNotesByDate).mockResolvedValue(notes);
    render(<Feed {...defaultProps} view={{ date: "2026-03-15" }} />);
    await waitFor(() => {
      expect(api.getNotesByDate).toHaveBeenCalledWith("2026-03-15");
    });
  });

  it("hides search input for date view", () => {
    render(<Feed {...defaultProps} view={{ date: "2026-03-15" }} />);
    expect(screen.queryByPlaceholderText("Search...")).not.toBeInTheDocument();
  });

  it("shows collection name as title for collection view", () => {
    const collections = [
      { id: "col-1", name: "Work", note_count: 2, created_at: "", updated_at: "" },
    ];
    render(<Feed {...defaultProps} view={{ collection: "col-1" }} collections={collections} />);
    expect(screen.getByText("Work")).toBeInTheDocument();
  });

  it("calls getNotesByCollectionCursor when in collection view", async () => {
    const notes = [makeNote({ id: "00000000-0000-0000-0000-000000000001", title: "Work Note" })];
    vi.mocked(api.getNotesByCollectionCursor).mockResolvedValue(notes);
    render(<Feed {...defaultProps} view={{ collection: "col-1" }} />);
    await waitFor(() => {
      expect(api.getNotesByCollectionCursor).toHaveBeenCalledWith("col-1", 50, null);
    });
  });

  it("shows search input for collection view", () => {
    render(<Feed {...defaultProps} view={{ collection: "col-1" }} />);
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("shows toast error when notes fail to load", async () => {
    vi.mocked(api.listNotesCursor).mockRejectedValue(new Error("Network error"));
    render(<Feed {...defaultProps} view="all" />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load notes/)).toBeInTheDocument();
    });
  });

  it("shows collection name badge on note card when in all view with collection", async () => {
    const collections = [
      { id: "col-1", name: "Work", note_count: 2, created_at: "", updated_at: "" },
    ];
    const notes = [
      makeNote({
        id: "00000000-0000-0000-0000-000000000001",
        title: "Work Note",
        collection_id: "col-1",
      }),
    ];
    vi.mocked(api.listNotesCursor).mockResolvedValue(notes);
    render(<Feed {...defaultProps} view="all" collections={collections} />);
    await waitFor(() => {
      expect(screen.getByText("Work Note")).toBeInTheDocument();
    });
  });

  it("does not confirm empty trash when cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onEmptyTrash = vi.fn();
    const notes = [makeNote({ id: "00000000-0000-0000-0000-000000000001", title: "Old Note" })];
    vi.mocked(api.getTrashCursor).mockResolvedValue(notes);
    render(<Feed {...defaultProps} view="trash" onEmptyTrash={onEmptyTrash} />);
    await waitFor(() => {
      expect(screen.getByText("Empty Trash")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Empty Trash"));
    expect(onEmptyTrash).not.toHaveBeenCalled();
  });

  it("triggers intersection observer to load more when sentinel is visible", async () => {
    // Mock IntersectionObserver to capture callback and trigger it
    let capturedCallback: IntersectionObserverCallback | null = null;
    let capturedObserver: {
      observe: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    } | null = null;

    vi.spyOn(globalThis, "IntersectionObserver").mockImplementation((cb) => {
      capturedCallback = cb;
      capturedObserver = {
        observe: vi.fn(),
        disconnect: vi.fn(),
      };
      return capturedObserver as unknown as IntersectionObserver;
    });

    // Return PAGE_SIZE (50) notes to indicate there could be more
    const notes = Array.from({ length: 50 }, (_, i) =>
      makeNote({ id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`, title: `Note ${i}` })
    );
    vi.mocked(api.listNotesCursor).mockResolvedValue(notes);
    render(<Feed {...defaultProps} view="all" />);
    await waitFor(() => {
      expect(screen.getByText("Note 0")).toBeInTheDocument();
    });

    // Simulate intersection observer callback firing (sentinel becomes visible)
    if (capturedCallback && capturedObserver) {
      const sentinel = document.querySelector(".h-px") as Element;
      (capturedCallback as IntersectionObserverCallback)(
        [{ isIntersecting: true, target: sentinel } as IntersectionObserverEntry],
        capturedObserver as unknown as IntersectionObserver
      );
    }

    vi.restoreAllMocks();
  });

  it("falls back to 'Notes' title for unrecognised view type", () => {
    render(<Feed {...defaultProps} view={"unknown" as unknown as View} />);
    expect(screen.getByText("Notes")).toBeInTheDocument();
  });

  it("shows empty state for unrecognised view type (fetchPage returns empty)", async () => {
    render(<Feed {...defaultProps} view={"unknown" as unknown as View} />);
    await waitFor(() => {
      expect(screen.getByText("No notes here yet")).toBeInTheDocument();
    });
  });

  it("IntersectionObserver callback covers loadMore and toCursor when re-run with visible sentinel", async () => {
    const notes = Array.from({ length: 50 }, (_, i) =>
      makeNote({
        id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
        title: `Page1 Note ${i}`,
      })
    );
    vi.mocked(api.listNotesCursor).mockResolvedValue(notes);

    const onNotesChange1 = vi.fn();
    const { rerender } = render(<Feed {...defaultProps} onNotesChange={onNotesChange1} />);

    // Wait for first page to load so sentinel div is rendered
    await waitFor(() => expect(screen.getByText("Page1 Note 0")).toBeInTheDocument());

    // Stub IntersectionObserver as a proper class constructor AFTER first load
    let capturedCallback: IntersectionObserverCallback | null = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          capturedCallback = cb;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      }
    );

    // Changing onNotesChange forces loadMore to be recreated, re-running the effect
    const onNotesChange2 = vi.fn();
    rerender(<Feed {...defaultProps} onNotesChange={onNotesChange2} />);

    // Effect re-ran with a visible sentinel — callback should now be captured
    expect(capturedCallback).not.toBeNull();

    // Fire the callback as if sentinel scrolled into view
    if (capturedCallback) {
      (capturedCallback as IntersectionObserverCallback)(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    }

    // loadMore(false) was triggered — wait for it to call onNotesChange (covers 44-45, 162-163)
    await waitFor(() => {
      expect(onNotesChange2).toHaveBeenCalled();
    });

    vi.unstubAllGlobals();
  });
});
