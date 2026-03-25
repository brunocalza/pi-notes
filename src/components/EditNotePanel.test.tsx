import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import EditNotePanel from "./EditNotePanel";
import { api } from "../api";
import { makeNote } from "../test/fixtures";

vi.mock("../api", () => ({
  api: {
    updateNote: vi.fn(),
    setNoteCollection: vi.fn().mockResolvedValue(undefined),
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
    const note = makeNote({
      id: "00000000-0000-0000-0000-000000000005",
      title: "Old Title",
      content: "Old content",
      tags: [],
    });
    render(<EditNotePanel note={note} onClose={onClose} onSaved={onSaved} />);

    const titleInput = screen.getByDisplayValue("Old Title");
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "New Title");
    await userEvent.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(api.updateNote).toHaveBeenCalledWith(
        "00000000-0000-0000-0000-000000000005",
        "New Title",
        "Old content",
        []
      );
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

  it("calls onClose when X icon button is clicked", async () => {
    render(<EditNotePanel note={makeNote()} onClose={onClose} onSaved={onSaved} />);
    const xButtons = screen.getAllByRole("button");
    const xBtn = xButtons.find((b) => b.querySelector("svg") && !b.textContent?.trim());
    await userEvent.click(xBtn!);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders collection selector when collections are provided", () => {
    const collections = [
      { id: "col-1", name: "Work", note_count: 1, created_at: "", updated_at: "" },
    ];
    render(
      <EditNotePanel
        note={makeNote({ collection_id: null })}
        onClose={onClose}
        onSaved={onSaved}
        collections={collections}
      />
    );
    expect(screen.getByText("Collection")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
  });

  it("calls setNoteCollection when collection changes during save", async () => {
    vi.mocked(api.updateNote).mockResolvedValue(undefined);
    const note = makeNote({ collection_id: null });
    const collections = [
      { id: "col-1", name: "Work", note_count: 1, created_at: "", updated_at: "" },
    ];
    const onSaved = vi.fn();

    render(
      <EditNotePanel note={note} onClose={onClose} onSaved={onSaved} collections={collections} />
    );

    await userEvent.selectOptions(screen.getByRole("combobox"), "col-1");
    await userEvent.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(api.setNoteCollection).toHaveBeenCalledWith(note.id, "col-1");
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("adds and removes tags via TagInput callbacks", async () => {
    vi.mocked(api.updateNote).mockResolvedValue(undefined);
    const note = makeNote({ tags: [] });
    render(<EditNotePanel note={note} onClose={onClose} onSaved={onSaved} />);

    const tagInput = screen.getByPlaceholderText("Add tag...");
    // Add a tag
    await userEvent.type(tagInput, "typescript{Enter}");

    await waitFor(() => {
      expect(screen.getByText("#typescript")).toBeInTheDocument();
    });

    // Remove the tag by clicking the X button next to it
    const removeBtn = screen.getAllByRole("button").find((b) => {
      const span = b.closest("span");
      return span?.textContent?.includes("#typescript") && b.querySelector("svg");
    });
    await userEvent.click(removeBtn!);

    await waitFor(() => {
      expect(screen.queryByText("#typescript")).not.toBeInTheDocument();
    });
  });

  it("clears title error on input change", async () => {
    const note = makeNote({ title: "Some Title" });
    render(<EditNotePanel note={note} onClose={onClose} onSaved={onSaved} />);

    // Trigger title required error
    await userEvent.clear(screen.getByDisplayValue("Some Title"));
    await userEvent.click(screen.getByText("Save Changes"));
    expect(screen.getByText("Title is required")).toBeInTheDocument();

    // Start typing in title - error should clear
    await userEvent.type(screen.getByPlaceholderText("Title"), "A");
    expect(screen.queryByText("Title is required")).not.toBeInTheDocument();
  });
});
