import { render, screen, waitFor } from "../test/render";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import NoteDetail from "./NoteDetail";
import { api } from "../api";
import { makeNote } from "../test/fixtures";

vi.mock("./MilkdownEditor", () => ({
  default: ({ content }: { content: string }) => <div data-testid="mock-milkdown">{content}</div>,
}));

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
    getAllNoteSummaries: vi.fn().mockResolvedValue([]),
    getAttachments: vi.fn().mockResolvedValue([]),
    addAttachment: vi.fn().mockResolvedValue("attachment-id"),
    deleteAttachment: vi.fn().mockResolvedValue(undefined),
    renameAttachment: vi.fn().mockResolvedValue(undefined),
    openAttachment: vi.fn().mockResolvedValue(undefined),
    setNoteCollection: vi.fn().mockResolvedValue(undefined),
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

    await waitFor(() => screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByLabelText("Note actions"));
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

    await waitFor(() => screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByLabelText("Note actions"));
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

    await waitFor(() => screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByLabelText("Note actions"));

    expect(screen.getByText("Delete permanently")).toBeInTheDocument();
    expect(screen.queryByText("Move to trash")).not.toBeInTheDocument();
  });

  it("calls deleteNote when Delete permanently is confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDeselect = vi.fn();
    const onRefresh = vi.fn();
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID7, trashed: true, in_inbox: false }));

    render(<NoteDetail {...defaultProps} onDeselect={onDeselect} onRefresh={onRefresh} />);

    await waitFor(() => screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByLabelText("Note actions"));
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

    await waitFor(() => screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByLabelText("Note actions"));
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

  it("shows collection badge when note has a collection", async () => {
    const collections = [
      { id: "col-1", name: "Work", note_count: 1, created_at: "", updated_at: "" },
    ];
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ collection_id: "col-1" }));

    render(<NoteDetail {...defaultProps} collections={collections} />);

    await waitFor(() => {
      expect(screen.getByText("Work")).toBeInTheDocument();
    });
  });

  it("calls setNoteCollection when moving note to a collection", async () => {
    const onRefresh = vi.fn();
    const collections = [
      { id: "col-1", name: "Work", note_count: 1, created_at: "", updated_at: "" },
    ];
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, in_inbox: false }));

    render(
      <NoteDetail {...defaultProps} noteId={ID1} collections={collections} onRefresh={onRefresh} />
    );

    await waitFor(() => screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByText("Move to collection"));
    await userEvent.click(screen.getByText("Work"));

    await waitFor(() => {
      expect(api.setNoteCollection).toHaveBeenCalledWith(ID1, "col-1");
      expect(onRefresh).toHaveBeenCalled();
    });
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

  it("shows Accept note button for inbox note and calls acceptNote on click", async () => {
    const onDeselect = vi.fn();
    const onRefresh = vi.fn();
    vi.mocked(api.getNote).mockResolvedValue(
      makeNote({ id: ID1, in_inbox: true, content: "some content" })
    );

    render(<NoteDetail {...defaultProps} onDeselect={onDeselect} onRefresh={onRefresh} />);

    await waitFor(() => screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByLabelText("Note actions"));
    expect(screen.getByText("Accept note")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Accept note"));

    await waitFor(() => {
      expect(api.acceptNote).toHaveBeenCalledWith(ID1);
      expect(onDeselect).toHaveBeenCalled();
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("shows Move to inbox button for trashed note and calls moveToInbox on click", async () => {
    const onDeselect = vi.fn();
    const onRefresh = vi.fn();
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID7, trashed: true, in_inbox: false }));

    render(<NoteDetail {...defaultProps} onDeselect={onDeselect} onRefresh={onRefresh} />);

    await waitFor(() => screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByLabelText("Note actions"));
    expect(screen.getByText("Move to inbox")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Move to inbox"));

    await waitFor(() => {
      expect(api.moveToInbox).toHaveBeenCalledWith(ID7);
      expect(onDeselect).toHaveBeenCalled();
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("removes a tag when its X button is clicked", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, tags: ["react"] }));

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("#react"));
    const tagSpan = screen.getByText("#react").closest(".group")!;
    const removeBtn = tagSpan.querySelector("button")!;
    await userEvent.click(removeBtn);

    await waitFor(() => {
      expect(api.updateNote).toHaveBeenCalledWith(ID1, expect.any(String), expect.any(String), []);
    });
  });

  it("opens tag input when Add tag is clicked", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, tags: [] }));

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("Add tag"));
    await userEvent.click(screen.getByText("Add tag"));

    expect(screen.getByPlaceholderText("Search or create…")).toBeInTheDocument();
  });

  it("adds a tag via the tag input and saves", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, tags: [] }));

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("Add tag"));
    await userEvent.click(screen.getByText("Add tag"));

    const tagInput = screen.getByPlaceholderText("Search or create…");
    await userEvent.type(tagInput, "newtag");
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      expect(api.updateNote).toHaveBeenCalledWith(ID1, expect.any(String), expect.any(String), [
        "newtag",
      ]);
    });
  });

  it("deletes an attachment when its X button is clicked", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1 }));
    vi.mocked(api.getAttachments).mockResolvedValue([
      {
        id: "att-1",
        note_id: ID1,
        filename: "doc.pdf",
        mime_type: "application/pdf",
        size: 100,
        created_at: new Date().toISOString(),
      },
    ]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("doc.pdf"));
    const attSpan = screen.getByText("doc.pdf").closest(".group")!;
    // The delete button is the last button inside the attachment chip
    const buttons = attSpan.querySelectorAll("button");
    const deleteBtn = buttons[buttons.length - 1];
    await userEvent.click(deleteBtn);

    await waitFor(() => {
      expect(api.deleteAttachment).toHaveBeenCalledWith("att-1");
    });
  });

  it("shows Accept note as disabled when note has no content", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, in_inbox: true, content: "" }));

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByLabelText("Note actions"));

    const acceptBtn = screen.getByText("Accept note").closest("button")!;
    expect(acceptBtn).toBeDisabled();
  });

  it("navigates collection submenu back to main actions", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, in_inbox: false }));
    const collections = [
      { id: "col-1", name: "Work", note_count: 1, created_at: "", updated_at: "" },
    ];

    render(<NoteDetail {...defaultProps} collections={collections} />);

    await waitFor(() => screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByText("Move to collection"));
    expect(screen.getByText("Work")).toBeInTheDocument();
    await userEvent.click(screen.getByText("← Back"));
    expect(screen.getByText("Move to collection")).toBeInTheDocument();
  });

  it("calls openAttachment when attachment filename is clicked", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1 }));
    vi.mocked(api.getAttachments).mockResolvedValue([
      {
        id: "att-1",
        note_id: ID1,
        filename: "doc.pdf",
        mime_type: "application/pdf",
        size: 100,
        created_at: new Date().toISOString(),
      },
    ]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("doc.pdf"));
    // The filename button is the first button in the attachment chip
    const attSpan = screen.getByText("doc.pdf").closest(".group")!;
    const buttons = attSpan.querySelectorAll("button");
    // First button is the filename (openAttachment) button
    await userEvent.click(buttons[0]);

    await waitFor(() => {
      expect(api.openAttachment).toHaveBeenCalledWith("att-1");
    });
  });

  it("enters rename mode when pencil button is clicked", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1 }));
    vi.mocked(api.getAttachments).mockResolvedValue([
      {
        id: "att-1",
        note_id: ID1,
        filename: "doc.pdf",
        mime_type: "application/pdf",
        size: 100,
        created_at: new Date().toISOString(),
      },
    ]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("doc.pdf"));
    const attSpan = screen.getByText("doc.pdf").closest(".group")!;
    const buttons = attSpan.querySelectorAll("button");
    // Second button is the rename (pencil) button
    await userEvent.click(buttons[1]);

    await waitFor(() => {
      const input = attSpan.querySelector("input");
      expect(input).toBeInTheDocument();
      expect((input as HTMLInputElement).value).toBe("doc.pdf");
    });
  });

  it("calls renameAttachment when rename input is blurred with new name", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1 }));
    vi.mocked(api.getAttachments).mockResolvedValue([
      {
        id: "att-1",
        note_id: ID1,
        filename: "doc.pdf",
        mime_type: "application/pdf",
        size: 100,
        created_at: new Date().toISOString(),
      },
    ]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("doc.pdf"));
    const attSpan = screen.getByText("doc.pdf").closest(".group")!;
    const buttons = attSpan.querySelectorAll("button");
    await userEvent.click(buttons[1]);

    await waitFor(() => {
      expect(attSpan.querySelector("input")).toBeInTheDocument();
    });

    const renameInput = attSpan.querySelector("input") as HTMLInputElement;
    await userEvent.clear(renameInput);
    await userEvent.type(renameInput, "renamed.pdf");
    fireEvent.blur(renameInput);

    await waitFor(() => {
      expect(api.renameAttachment).toHaveBeenCalledWith("att-1", "renamed.pdf");
    });
  });

  it("cancels rename on Escape key", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1 }));
    vi.mocked(api.getAttachments).mockResolvedValue([
      {
        id: "att-1",
        note_id: ID1,
        filename: "doc.pdf",
        mime_type: "application/pdf",
        size: 100,
        created_at: new Date().toISOString(),
      },
    ]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("doc.pdf"));
    const attSpan = screen.getByText("doc.pdf").closest(".group")!;
    const buttons = attSpan.querySelectorAll("button");
    await userEvent.click(buttons[1]);

    await waitFor(() => {
      expect(attSpan.querySelector("input")).toBeInTheDocument();
    });

    const renameInput = attSpan.querySelector("input") as HTMLInputElement;
    fireEvent.keyDown(renameInput, { key: "Escape" });

    await waitFor(() => {
      expect(screen.getByText("doc.pdf")).toBeInTheDocument();
    });
    expect(api.renameAttachment).not.toHaveBeenCalled();
  });

  it("shows None option and assigns null collection in submenu", async () => {
    const onRefresh = vi.fn();
    const collections = [
      { id: "col-1", name: "Work", note_count: 1, created_at: "", updated_at: "" },
    ];
    vi.mocked(api.getNote).mockResolvedValue(
      makeNote({ id: ID1, in_inbox: false, collection_id: "col-1" })
    );

    render(
      <NoteDetail {...defaultProps} noteId={ID1} collections={collections} onRefresh={onRefresh} />
    );

    await waitFor(() => screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByText("Move to collection"));
    await userEvent.click(screen.getByText("None"));

    await waitFor(() => {
      expect(api.setNoteCollection).toHaveBeenCalledWith(ID1, null);
    });
  });

  it("confirms rename on Enter key in rename input", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1 }));
    vi.mocked(api.getAttachments).mockResolvedValue([
      {
        id: "att-1",
        note_id: ID1,
        filename: "doc.pdf",
        mime_type: "application/pdf",
        size: 100,
        created_at: new Date().toISOString(),
      },
    ]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("doc.pdf"));
    const attSpan = screen.getByText("doc.pdf").closest(".group")!;
    const buttons = attSpan.querySelectorAll("button");
    await userEvent.click(buttons[1]);

    await waitFor(() => {
      expect(attSpan.querySelector("input")).toBeInTheDocument();
    });

    const renameInput = attSpan.querySelector("input") as HTMLInputElement;
    await userEvent.clear(renameInput);
    await userEvent.type(renameInput, "newname.pdf");
    fireEvent.keyDown(renameInput, { key: "Enter" });

    await waitFor(() => {
      expect(api.renameAttachment).toHaveBeenCalledWith("att-1", "newname.pdf");
    });
  });

  it("shows + button when tags exist and opens tag input on click", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, tags: ["existing"] }));

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("#existing"));
    // The + button (Add tag) should be visible when tags exist
    const addTagBtn = screen.getByLabelText("Add tag");
    expect(addTagBtn).toBeInTheDocument();
    await userEvent.click(addTagBtn);

    expect(screen.getByPlaceholderText("Search or create…")).toBeInTheDocument();
  });

  it("sets tag suggestion active index on mouseEnter", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, tags: [] }));
    vi.mocked(api.getAllTags).mockResolvedValue([
      ["alpha", 1],
      ["beta", 2],
    ]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("Add tag"));
    await userEvent.click(screen.getByText("Add tag"));

    const tagInput = screen.getByPlaceholderText("Search or create…");
    await userEvent.type(tagInput, "a");

    await waitFor(() => {
      expect(screen.getByText("#alpha")).toBeInTheDocument();
    });

    // Hover over the second suggestion to change active index
    fireEvent.mouseEnter(screen.getByText("#alpha").closest("button")!);
    // Should not crash and suggestion should still be visible
    expect(screen.getByText("#alpha")).toBeInTheDocument();
  });

  it("opens attachment via button click", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1 }));
    vi.mocked(api.getAttachments).mockResolvedValue([
      {
        id: "att-open",
        note_id: ID1,
        filename: "image.png",
        mime_type: "image/png",
        size: 200,
        created_at: new Date().toISOString(),
      },
    ]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("image.png"));
    const attSpan = screen.getByText("image.png").closest(".group")!;
    const openBtn = attSpan.querySelectorAll("button")[0];
    await userEvent.click(openBtn);

    await waitFor(() => {
      expect(api.openAttachment).toHaveBeenCalledWith("att-open");
    });
  });

  it("triggers file input when attach button is clicked", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1 }));
    vi.mocked(api.getAttachments).mockResolvedValue([]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("Attach"));
    const attachBtn = screen.getByText("Attach").closest("button")!;
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");

    await userEvent.click(attachBtn);
    expect(clickSpy).toHaveBeenCalled();
  });

  it("shows create tag button and mouseDown commits new tag", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, tags: [] }));
    // Return empty tag list so 'brandnew' is not in existing tags
    vi.mocked(api.getAllTags).mockResolvedValue([]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("Add tag"));
    await userEvent.click(screen.getByText("Add tag"));

    const tagInput = screen.getByPlaceholderText("Search or create…");
    await userEvent.type(tagInput, "brandnew");

    await waitFor(() => {
      // The "Create" button should be visible - find the create button in the popover
      const buttons = screen.getAllByRole("button");
      const createBtn = buttons.find(
        (b) => b.textContent?.includes("Create") && b.textContent?.includes("brandnew")
      );
      expect(createBtn).toBeInTheDocument();
    });

    // Click the Create button via mouseDown to commit tag
    const buttons = screen.getAllByRole("button");
    const createBtn = buttons.find(
      (b) => b.textContent?.includes("Create") && b.textContent?.includes("brandnew")
    )!;
    fireEvent.mouseDown(createBtn, { button: 0 });

    await waitFor(() => {
      expect(api.updateNote).toHaveBeenCalledWith(ID1, expect.any(String), expect.any(String), [
        "brandnew",
      ]);
    });
  });

  it("commits tag via Enter key in tag input", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, tags: [] }));
    vi.mocked(api.getAllTags).mockResolvedValue([]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("Add tag"));
    await userEvent.click(screen.getByText("Add tag"));

    const tagInput = screen.getByPlaceholderText("Search or create…");
    await userEvent.type(tagInput, "newtag");

    // Press Enter to commit tag
    fireEvent.keyDown(tagInput, { key: "Enter" });

    await waitFor(() => {
      expect(api.updateNote).toHaveBeenCalledWith(ID1, expect.any(String), expect.any(String), [
        "newtag",
      ]);
    });
  });

  it("selects suggestion via mouseDown in tag input", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, tags: [] }));
    vi.mocked(api.getAllTags).mockResolvedValue([["react", 1]]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("Add tag"));
    await userEvent.click(screen.getByText("Add tag"));

    const tagInput = screen.getByPlaceholderText("Search or create…");
    await userEvent.type(tagInput, "r");

    await waitFor(() => {
      expect(screen.getByText("#react")).toBeInTheDocument();
    });

    // mouseDown on suggestion button
    const suggBtn = screen.getByText("#react").closest("button")!;
    fireEvent.mouseDown(suggBtn, { button: 0 });

    await waitFor(() => {
      expect(api.updateNote).toHaveBeenCalledWith(ID1, expect.any(String), expect.any(String), [
        "react",
      ]);
    });
  });

  it("sets active suggestion index on mouseEnter in tag dropdown", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, tags: [] }));
    vi.mocked(api.getAllTags).mockResolvedValue([
      ["alpha", 1],
      ["beta", 2],
    ]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("Add tag"));
    await userEvent.click(screen.getByText("Add tag"));

    const tagInput = screen.getByPlaceholderText("Search or create…");
    await userEvent.type(tagInput, "a");

    await waitFor(() => {
      expect(screen.getByText("#alpha")).toBeInTheDocument();
    });

    // mouseEnter on suggestion to change active index
    const alphaBtn = screen.getByText("#alpha").closest("button")!;
    fireEvent.mouseEnter(alphaBtn);
    // Should not crash
    expect(alphaBtn).toBeInTheDocument();
  });

  it("navigates tag suggestions with ArrowUp", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, tags: [] }));
    vi.mocked(api.getAllTags).mockResolvedValue([
      ["alpha", 1],
      ["beta", 2],
    ]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("Add tag"));
    await userEvent.click(screen.getByText("Add tag"));

    const tagInput = screen.getByPlaceholderText("Search or create…");
    await userEvent.type(tagInput, "a");

    await waitFor(() => {
      expect(screen.getByText("#alpha")).toBeInTheDocument();
    });

    // Navigate down first
    fireEvent.keyDown(tagInput, { key: "ArrowDown" });
    // Then navigate up
    fireEvent.keyDown(tagInput, { key: "ArrowUp" });
    // Should not crash - suggestions still visible
    expect(screen.getByText("#alpha")).toBeInTheDocument();
  });

  it("sets mouseEnter active index on create tag button in dropdown", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, tags: [] }));
    vi.mocked(api.getAllTags).mockResolvedValue([]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("Add tag"));
    await userEvent.click(screen.getByText("Add tag"));

    const tagInput = screen.getByPlaceholderText("Search or create…");
    await userEvent.type(tagInput, "newtag");

    await waitFor(() => {
      const createBtns = screen
        .getAllByRole("button")
        .filter((b) => b.textContent?.includes("Create") && b.textContent?.includes("newtag"));
      expect(createBtns.length).toBeGreaterThan(0);
    });

    const createBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("Create") && b.textContent?.includes("newtag"))!;
    fireEvent.mouseEnter(createBtn);
    // Should not crash
    expect(createBtn).toBeInTheDocument();
  });

  it("closes tag input on outside click", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, tags: [] }));

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("Add tag"));
    await userEvent.click(screen.getByText("Add tag"));

    expect(screen.getByPlaceholderText("Search or create…")).toBeInTheDocument();

    // Click outside to close
    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Search or create…")).not.toBeInTheDocument();
    });
  });

  it("commits tag via Enter when no suggestions and no create option (totalItems=0)", async () => {
    // Tag already in note AND in allTagsList → totalItems=0
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, tags: ["react"] }));
    vi.mocked(api.getAllTags).mockResolvedValue([["react", 1]]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByLabelText("Add tag"));
    await userEvent.click(screen.getByLabelText("Add tag"));

    const tagInput = screen.getByPlaceholderText("Search or create…");
    // Type the exact tag that's already in the note (so totalItems=0)
    // React requires fireEvent.change to simulate controlled input
    fireEvent.change(tagInput, { target: { value: "react" } });

    await waitFor(() => {
      // Verify no suggestions/create visible — tagSuggestions is empty + showCreate false
      const buttons = screen
        .queryAllByRole("button")
        .filter((b) => b.textContent?.includes("react") && !b.textContent?.includes("#react"));
      // There should be no suggestion or create buttons visible
      expect(buttons.length).toBe(0);
    });

    // Press Enter - should call commitTag("react") but react is already in tags so it's a no-op
    fireEvent.keyDown(tagInput, { key: "Enter" });

    // The tag input should close (commitTag always calls setTagInputOpen(false))
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Search or create…")).not.toBeInTheDocument();
    });
  });

  it("shows toast when acceptNote fails", async () => {
    vi.mocked(api.getNote).mockResolvedValue(
      makeNote({ id: ID1, in_inbox: true, content: "content" })
    );
    vi.mocked(api.acceptNote).mockRejectedValue(new Error("accept failed"));

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByText("Accept note"));

    await waitFor(() => {
      expect(screen.getByText(/Failed to accept note/)).toBeInTheDocument();
    });
  });

  it("shows toast when trashNote fails", async () => {
    vi.mocked(api.getNote).mockResolvedValue(
      makeNote({ id: ID1, in_inbox: false, trashed: false })
    );
    vi.mocked(api.trashNote).mockRejectedValue(new Error("trash failed"));

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByText("Move to trash"));

    await waitFor(() => {
      expect(screen.getByText(/Failed to trash note/)).toBeInTheDocument();
    });
  });

  it("shows toast when addAttachment fails", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1 }));
    vi.mocked(api.getAttachments).mockResolvedValue([]);
    vi.mocked(api.addAttachment).mockRejectedValue(new Error("file too large"));

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("Attach"));

    // Simulate file input change
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["content"], "test.txt", { type: "text/plain" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(screen.getByText(/Failed to attach file/)).toBeInTheDocument();
    });
  });

  it("shows toast when deleteAttachment fails", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1 }));
    vi.mocked(api.getAttachments).mockResolvedValue([
      {
        id: "att-del-fail",
        note_id: ID1,
        filename: "fail-del.pdf",
        mime_type: "application/pdf",
        size: 100,
        created_at: new Date().toISOString(),
      },
    ]);
    vi.mocked(api.deleteAttachment).mockRejectedValue(new Error("delete error"));

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("fail-del.pdf"));
    const attSpan = screen.getByText("fail-del.pdf").closest(".group")!;
    const buttons = attSpan.querySelectorAll("button");
    const deleteBtn = buttons[buttons.length - 1];
    await userEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByText(/Failed to delete attachment/)).toBeInTheDocument();
    });
  });

  it("updates note content when attachment is renamed and appears in content", async () => {
    const noteContent = "See attachment:doc.pdf for details";
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1, content: noteContent }));
    vi.mocked(api.getAttachments).mockResolvedValue([
      {
        id: "att-rename",
        note_id: ID1,
        filename: "doc.pdf",
        mime_type: "application/pdf",
        size: 100,
        created_at: new Date().toISOString(),
      },
    ]);

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("doc.pdf"));
    const attSpan = screen.getByText("doc.pdf").closest(".group")!;
    const buttons = attSpan.querySelectorAll("button");
    await userEvent.click(buttons[1]); // pencil button

    await waitFor(() => expect(attSpan.querySelector("input")).toBeInTheDocument());

    const renameInput = attSpan.querySelector("input") as HTMLInputElement;
    await userEvent.clear(renameInput);
    await userEvent.type(renameInput, "renamed.pdf");
    fireEvent.blur(renameInput);

    await waitFor(() => {
      // updateNote should be called since content contained the old filename
      expect(api.updateNote).toHaveBeenCalled();
    });
  });

  it("shows toast when deleteNote fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID7, trashed: true, in_inbox: false }));
    vi.mocked(api.deleteNote).mockRejectedValue(new Error("disk error"));

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByText("Delete permanently"));

    await waitFor(() => {
      expect(screen.getByText(/Failed to delete note/)).toBeInTheDocument();
    });
  });

  it("shows toast when moveToInbox fails", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID7, trashed: true, in_inbox: false }));
    vi.mocked(api.moveToInbox).mockRejectedValue(new Error("move failed"));

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByLabelText("Note actions"));
    await userEvent.click(screen.getByText("Move to inbox"));

    await waitFor(() => {
      expect(screen.getByText(/Failed to move note to inbox/)).toBeInTheDocument();
    });
  });

  it("shows error toast when openAttachment fails", async () => {
    vi.mocked(api.getNote).mockResolvedValue(makeNote({ id: ID1 }));
    vi.mocked(api.getAttachments).mockResolvedValue([
      {
        id: "att-fail",
        note_id: ID1,
        filename: "fail.pdf",
        mime_type: "application/pdf",
        size: 100,
        created_at: new Date().toISOString(),
      },
    ]);
    vi.mocked(api.openAttachment).mockRejectedValue("No such file");

    render(<NoteDetail {...defaultProps} />);

    await waitFor(() => screen.getByText("fail.pdf"));
    const attSpan = screen.getByText("fail.pdf").closest(".group")!;
    const openBtn = attSpan.querySelectorAll("button")[0];
    await userEvent.click(openBtn);

    await waitFor(() => {
      expect(screen.getByText(/Failed to open attachment/)).toBeInTheDocument();
    });
  });
});
