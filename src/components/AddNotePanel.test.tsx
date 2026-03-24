import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import AddNotePanel from "./AddNotePanel";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    insertNote: vi.fn(),
    setNoteCollection: vi.fn().mockResolvedValue(undefined),
    getAllTags: vi.fn().mockResolvedValue([]),
    getAllNoteTitles: vi.fn().mockResolvedValue([]),
  },
}));

describe("AddNotePanel", () => {
  const onClose = vi.fn();
  const onSaved = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows validation error when saving with empty title", async () => {
    render(<AddNotePanel onClose={onClose} onSaved={onSaved} />);

    await userEvent.click(screen.getByText("Save Note"));

    expect(screen.getByText("Title is required")).toBeInTheDocument();
    expect(api.insertNote).not.toHaveBeenCalled();
  });

  it("calls insertNote and onSaved when title is provided", async () => {
    vi.mocked(api.insertNote).mockResolvedValue("00000000-0000-0000-0000-000000000001");

    render(<AddNotePanel onClose={onClose} onSaved={onSaved} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), "My Note");
    await userEvent.click(screen.getByText("Save Note"));

    await waitFor(() => {
      expect(api.insertNote).toHaveBeenCalledWith("My Note", "", []);
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("shows error message when insertNote fails", async () => {
    vi.mocked(api.insertNote).mockRejectedValue(new Error("DB error"));

    render(<AddNotePanel onClose={onClose} onSaved={onSaved} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), "My Note");
    await userEvent.click(screen.getByText("Save Note"));

    await waitFor(() => {
      expect(screen.getByText("Error: DB error")).toBeInTheDocument();
    });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    render(<AddNotePanel onClose={onClose} onSaved={onSaved} />);

    await userEvent.click(screen.getByText("Cancel"));

    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when X button is clicked", async () => {
    render(<AddNotePanel onClose={onClose} onSaved={onSaved} />);
    // The X button is the close icon in the header
    const xButtons = screen.getAllByRole("button");
    const xBtn = xButtons.find((b) => b.querySelector("svg") && !b.textContent?.trim());
    await userEvent.click(xBtn!);
    expect(onClose).toHaveBeenCalled();
  });

  it("renders collection selector when collections are provided", () => {
    const collections = [
      { id: "col-1", name: "Work", note_count: 1, created_at: "", updated_at: "" },
    ];
    render(<AddNotePanel onClose={onClose} onSaved={onSaved} collections={collections} />);
    expect(screen.getByText("Collection")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
  });

  it("saves note with selected collection", async () => {
    vi.mocked(api.insertNote).mockResolvedValue("note-id");
    const collections = [
      { id: "col-1", name: "Work", note_count: 1, created_at: "", updated_at: "" },
    ];
    const onSaved = vi.fn();

    render(<AddNotePanel onClose={onClose} onSaved={onSaved} collections={collections} />);

    await userEvent.type(screen.getByPlaceholderText("Title"), "My Note");
    await userEvent.selectOptions(screen.getByRole("combobox"), "col-1");
    await userEvent.click(screen.getByText("Save Note"));

    await waitFor(() => {
      expect(api.insertNote).toHaveBeenCalled();
      expect(api.setNoteCollection).toHaveBeenCalledWith("note-id", "col-1");
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("adds and removes tags via TagInput callbacks", async () => {
    vi.mocked(api.insertNote).mockResolvedValue("note-id");
    render(<AddNotePanel onClose={onClose} onSaved={onSaved} />);

    const tagInput = screen.getByPlaceholderText("Add tag...");
    // Add a tag
    await userEvent.type(tagInput, "react{Enter}");

    await waitFor(() => {
      expect(screen.getByText("#react")).toBeInTheDocument();
    });

    // Remove the tag by clicking the X button next to it
    const removeBtn = screen.getAllByRole("button").find((b) => {
      const span = b.closest("span");
      return span?.textContent?.includes("#react") && b.querySelector("svg");
    });
    await userEvent.click(removeBtn!);

    await waitFor(() => {
      expect(screen.queryByText("#react")).not.toBeInTheDocument();
    });
  });

  it("clears title error on input change", async () => {
    render(<AddNotePanel onClose={onClose} onSaved={onSaved} />);

    // Trigger title required error
    await userEvent.click(screen.getByText("Save Note"));
    expect(screen.getByText("Title is required")).toBeInTheDocument();

    // Start typing in title - error should clear
    await userEvent.type(screen.getByPlaceholderText("Title"), "A");
    expect(screen.queryByText("Title is required")).not.toBeInTheDocument();
  });
});
