import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import AddNotePanel from "./AddNotePanel";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    insertNote: vi.fn(),
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
});
