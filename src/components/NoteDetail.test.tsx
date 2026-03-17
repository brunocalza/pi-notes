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
    getAllNoteTitles: vi.fn().mockResolvedValue([]),
  },
}));

const defaultProps = {
  noteId: 1,
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
    vi.mocked(api.getBacklinks).mockResolvedValue([
      makeNote({ id: 2, title: "Linking Note" }),
    ]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Linking Note")).toBeInTheDocument();
    });
  });

  it("calls trashNote and onDeselect when trash button is clicked", async () => {
    const onDeselect = vi.fn();
    const onRefresh = vi.fn();
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: 1 }));

    render(<NoteDetail {...defaultProps} onDeselect={onDeselect} onRefresh={onRefresh} />);

    await waitFor(() => screen.getByTitle("Move to trash"));
    await userEvent.click(screen.getByTitle("Move to trash"));

    expect(api.trashNote).toHaveBeenCalledWith(1);
    expect(onDeselect).toHaveBeenCalled();
  });

  it("calls updateNote on title blur", async () => {
    const note = makeNote({ id: 1, title: "Original", content: "" });
    vi.mocked(api.getNote).mockResolvedValue(note);

    render(<NoteDetail {...defaultProps} />);

    const titleInput = await screen.findByDisplayValue("Original");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated");
    await userEvent.tab();

    await waitFor(() => {
      expect(api.updateNote).toHaveBeenCalledWith(1, "Updated", "", []);
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
    vi.mocked(api.getBacklinks).mockResolvedValue([makeNote({ id: 99, title: "Source Note" })]);

    render(<NoteDetail {...defaultProps} onNavigate={onNavigate} />);

    await waitFor(() => screen.getByText("Source Note"));
    await userEvent.click(screen.getByText("Source Note"));

    expect(onNavigate).toHaveBeenCalledWith(99);
  });
});
