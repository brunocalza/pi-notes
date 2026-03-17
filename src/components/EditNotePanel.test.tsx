import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import EditNotePanel from "./EditNotePanel";
import { api } from "../api";
import { makeNote } from "../test/fixtures";

vi.mock("../api", () => ({
  api: {
    updateNote: vi.fn(),
    getAllTags: vi.fn().mockResolvedValue([]),
    getAllNoteTitles: vi.fn().mockResolvedValue([]),
  },
}));

describe("EditNotePanel", () => {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it("pre-fills title and tags from the note", () => {
    const note = makeNote({ title: "Existing Title", tags: ["react"] });
    render(<EditNotePanel note={note} onClose={onClose} onSaved={onSaved} />);

    expect(screen.getByDisplayValue("Existing Title")).toBeInTheDocument();
    expect(screen.getByText("#react")).toBeInTheDocument();
  });

  it("shows validation error when saving with empty title", async () => {
    const note = makeNote({ title: "Some Title" });
    render(<EditNotePanel note={note} onClose={onClose} onSaved={onSaved} />);

    await userEvent.clear(screen.getByDisplayValue("Some Title"));
    await userEvent.click(screen.getByText("Save Changes"));

    expect(screen.getByText("Title is required")).toBeInTheDocument();
    expect(api.updateNote).not.toHaveBeenCalled();
  });

  it("calls updateNote with correct args and fires onSaved", async () => {
    vi.mocked(api.updateNote).mockResolvedValue(undefined);
    const note = makeNote({ id: 5, title: "Old Title", content: "Old content", tags: [] });
    render(<EditNotePanel note={note} onClose={onClose} onSaved={onSaved} />);

    const titleInput = screen.getByDisplayValue("Old Title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "New Title");
    await userEvent.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(api.updateNote).toHaveBeenCalledWith(5, "New Title", "Old content", []);
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("shows error message when updateNote fails", async () => {
    vi.mocked(api.updateNote).mockRejectedValue(new Error("Save failed"));
    const note = makeNote({ title: "My Note" });
    render(<EditNotePanel note={note} onClose={onClose} onSaved={onSaved} />);

    await userEvent.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(screen.getByText("Error: Save failed")).toBeInTheDocument();
    });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    render(<EditNotePanel note={makeNote()} onClose={onClose} onSaved={onSaved} />);
    await userEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
