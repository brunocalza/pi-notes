import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import NoteDetail from "./NoteDetail";
import { api } from "../api";
import { makeNote } from "../test/fixtures";

vi.mock("../api", () => ({
  api: {
    getNote: vi.fn(),
    getBacklinks: vi.fn().mockResolvedValue([]),
    getAllTags: vi.fn().mockResolvedValue([]),
    updateNote: vi.fn().mockResolvedValue(undefined),
    trashNote: vi.fn().mockResolvedValue(undefined),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    acceptNote: vi.fn().mockResolvedValue(undefined),
    moveToInbox: vi.fn().mockResolvedValue(undefined),
    getAllNoteTitles: vi.fn().mockResolvedValue([]),
    getAttachments: vi.fn().mockResolvedValue([]),
  },
}));

const ID1 = "00000000-0000-0000-0000-000000000001";
const ID2 = "00000000-0000-0000-0000-000000000002";
const ID5 = "00000000-0000-0000-0000-000000000005";
const ID7 = "00000000-0000-0000-0000-000000000007";
const ID99 = "00000000-0000-0000-0000-000000000099";

const defaultProps = {
  noteId: ID1,
  onNavigate: vi.fn(),
  onTagClick: vi.fn(),
  onDeselect: vi.fn(),
  onRefresh: vi.fn(),
};

describe("NoteDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows loading state initially", () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote());
    render(<NoteDetail {...defaultProps} />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders note title and content after loading", async () => {
    const note = makeNote({ title: "My Note", content: "Some content" });
    vi.mocked(api.getNote).mockResolvedValue(note);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("My Note")).toBeInTheDocument();
    });
  });

  it("renders note tags", async () => {
    const note = makeNote({ tags: ["react", "typescript"] });
    vi.mocked(api.getNote).mockResolvedValue(note);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("#react")).toBeInTheDocument();
      expect(screen.getByText("#typescript")).toBeInTheDocument();
    });
  });

  it("renders backlinks when present", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote());
    vi.mocked(api.getBacklinks).mockResolvedValue([makeNote({ id: ID2, title: "Linking Note" })]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Linking Note")).toBeInTheDocument();
    });
  });

  it("calls trashNote, onDeselect, and onRefresh when trash button is clicked", async () => {
    const onDeselect = vi.fn();
    const onRefresh = vi.fn();
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1 }));

    render(<NoteDetail {...defaultProps} onDeselect={onDeselect} onRefresh={onRefresh} />);

    await waitFor(() => screen.getByTitle("Note actions"));
    await userEvent.click(screen.getByTitle("Note actions"));
    await userEvent.click(screen.getByText("Move to trash"));

    await waitFor(() => {
      expect(api.trashNote).toHaveBeenCalledWith(ID1);
      expect(onDeselect).toHaveBeenCalled();
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("calls trashNote on a regular (non-inbox) note", async () => {
    const onDeselect = vi.fn();
    const onRefresh = vi.fn();
    vi.mocked(api.getNote).mockResolvedValue(
      makeNote({ id: ID5, in_inbox: false, trashed: false })
    );

    render(<NoteDetail {...defaultProps} onDeselect={onDeselect} onRefresh={onRefresh} />);

    await waitFor(() => screen.getByTitle("Note actions"));
    await userEvent.click(screen.getByTitle("Note actions"));
    await userEvent.click(screen.getByText("Move to trash"));

    await waitFor(() => {
      expect(api.trashNote).toHaveBeenCalledWith(ID5);
      expect(onDeselect).toHaveBeenCalled();
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("shows Delete permanently (not Move to trash) for trashed notes", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID7, trashed: true, in_inbox: false }));

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByTitle("Note actions"));
    await userEvent.click(screen.getByTitle("Note actions"));

    expect(screen.getByText("Delete permanently")).toBeInTheDocument();
    expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();
  });

  it("calls deleteNote when Delete permanently is confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDeselect = vi.fn();
    const onRefresh = vi.fn();
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID7, trashed: true, in_inbox: false }));

    render(<NoteDetail {...defaultProps} onDeselect={onDeselect} onRefresh={onRefresh} />);

    await waitFor(() => screen.getByTitle("Note actions"));
    await userEvent.click(screen.getByTitle("Note actions"));
    await userEvent.click(screen.getByText("Delete permanently"));

    await waitFor(() => {
      expect(api.deleteNote).toHaveBeenCalledWith(ID7);
      expect(onDeselect).toHaveBeenCalled();
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("does not call deleteNote when Delete permanently is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID7, trashed: true, in_inbox: false }));

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByTitle("Note actions"));
    await userEvent.click(screen.getByTitle("Note actions"));
    await userEvent.click(screen.getByText("Delete permanently"));

    expect(api.deleteNote).not.toHaveBeenCalled();
  });

  it("does not call updateNote on title blur when title is unchanged", async () => {
    const note = makeNote({ id: ID1, title: "Same Title", content: "" });
    vi.mocked(api.getNote).mockResolvedValue(note);

    render(<NoteDetail {...defaultProps} />);

    const titleInput = await screen.findByDisplayValue("Same Title");
    await userEvent.click(titleInput);
    await userEvent.tab();

    expect(api.updateNote).not.toHaveBeenCalled();
  });

  it("calls updateNote on title blur", async () => {
    const note = makeNote({ id: ID1, title: "Original", content: "" });
    vi.mocked(api.getNote).mockResolvedValue(note);

    render(<NoteDetail {...defaultProps} />);

    const titleInput = await screen.findByDisplayValue("Original");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated");
    await userEvent.tab();

    await waitFor(() => {
      expect(api.updateNote).toHaveBeenCalledWith(ID1, "Updated", "", []);
    });
  });

  it("calls onTagClick when a tag is clicked", async () => {
    const onTagClick = vi.fn();
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ tags: ["react"] }));

    render(<NoteDetail {...defaultProps} onTagClick={onTagClick} />);

    await waitFor(() => screen.getByText("#react"));
    await userEvent.click(screen.getByText("#react"));

    expect(onTagClick).toHaveBeenCalledWith("react");
  });

  it("navigates to backlink note when it is clicked", async () => {
    const onNavigate = vi.fn();
    vi.mocked(api.getNote).mockResolvedValue(makeNote());
    vi.mocked(api.getBacklinks).mockResolvedValue([makeNote({ id: ID99, title: "Source Note" })]);

    render(<NoteDetail {...defaultProps} onNavigate={onNavigate} />);

    await waitFor(() => screen.getByText("Source Note"));
    await userEvent.click(screen.getByText("Source Note"));

    expect(onNavigate).toHaveBeenCalledWith(ID99);
  });
});
