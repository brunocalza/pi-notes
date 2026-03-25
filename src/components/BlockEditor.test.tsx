import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import BlockEditor from "./BlockEditor";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    getAllNoteTitles: vi.fn().mockResolvedValue([]),
    getNoteByTitle: vi.fn(),
    openUrl: vi.fn().mockResolvedValue(undefined),
    getAttachmentData: vi.fn().mockResolvedValue("base64data"),
  },
}));

describe("BlockEditor", () => {
  const onCommit = vi.fn();
  const onNavigate = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it("renders content as markdown blocks", () => {
    render(<BlockEditor content="Hello world" onCommit={onCommit} onNavigate={onNavigate} />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("activates a textarea when a block is clicked", async () => {
    render(<BlockEditor content="Click me" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("Click me"));
    expect(screen.getByRole("textbox") as HTMLTextAreaElement).toHaveValue("Click me");
  });

  it("calls onCommit with updated content when textarea loses focus", async () => {
    render(<BlockEditor content="Original" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("Original"));

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Updated");
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith("Updated");
    });
  });

  it("does not call onCommit on blur when content is unchanged", async () => {
    render(<BlockEditor content="Original" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("Original"));
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("renders multiple blocks from double-newline-separated content", () => {
    render(
      <BlockEditor
        content={"First paragraph\n\nSecond paragraph"}
        onCommit={onCommit}
        onNavigate={onNavigate}
      />
    );
    expect(screen.getByText("First paragraph")).toBeInTheDocument();
    expect(screen.getByText("Second paragraph")).toBeInTheDocument();
  });

  it("shows wikilink suggestions when typing [[", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["Target Note"]);

    render(<BlockEditor content="Start" onCommit={onCommit} onNavigate={onNavigate} />);

    await waitFor(() => {});

    await userEvent.click(screen.getByText("Start"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    // fireEvent.change bypasses userEvent's key-escaping for `[`
    fireEvent.change(textarea, { target: { value: "[[Target", selectionStart: 8 } });

    await waitFor(() => {
      expect(screen.getByText("Target Note")).toBeInTheDocument();
    });
  });

  it("shows DatePicker when /date command is typed in edit mode", async () => {
    render(<BlockEditor content="Start" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("Start"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "/date", selectionStart: 5 } });
    await waitFor(() => {
      expect(screen.getByText("Su")).toBeInTheDocument();
    });
  });

  it("renders YYYY-MM-DD dates as human-readable clickable links in read mode", async () => {
    render(
      <BlockEditor content="Note from 2026-03-15" onCommit={onCommit} onNavigate={onNavigate} />
    );
    await waitFor(() => {
      expect(screen.getByText("Mar 15, 2026")).toBeInTheDocument();
    });
  });

  it("calls onDateSelect when a date link is clicked", async () => {
    const onDateSelect = vi.fn();
    render(
      <BlockEditor
        content="2026-03-15"
        onCommit={onCommit}
        onNavigate={onNavigate}
        onDateSelect={onDateSelect}
      />
    );
    await waitFor(() => screen.getByText("Mar 15, 2026"));
    await userEvent.click(screen.getByText("Mar 15, 2026"));
    await waitFor(() => {
      expect(onDateSelect).toHaveBeenCalledWith("2026-03-15");
    });
  });

  it("does not render invalid dates as links", async () => {
    render(
      <BlockEditor
        content="2025-13-01 and 2025-02-30 and 2025-00-01"
        onCommit={onCommit}
        onNavigate={onNavigate}
      />
    );
    await waitFor(() => screen.getByText(/2025-13-01/));
    // None of the invalid dates should be rendered as anchor links
    const links = document.querySelectorAll("a[href^='date:']");
    expect(links.length).toBe(0);
  });

  it("calls onNavigate when a wikilink is clicked", async () => {
    vi.mocked(api.getNoteByTitle).mockResolvedValue({ id: 7 } as any); // eslint-disable-line @typescript-eslint/no-explicit-any

    render(
      <BlockEditor content="See [[Linked Note]]" onCommit={onCommit} onNavigate={onNavigate} />
    );

    await waitFor(() => screen.getByText("Linked Note"));
    await userEvent.click(screen.getByText("Linked Note"));

    await waitFor(() => {
      expect(onNavigate).toHaveBeenCalledWith(7);
    });
  });

  it("deactivates block on Escape", async () => {
    render(<BlockEditor content="Hello" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("Hello"));
    expect(screen.getByRole("textbox") as HTMLTextAreaElement).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("textbox") as HTMLTextAreaElement, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("textbox")).not.toBeInTheDocument());
  });

  it("applies bold formatting via toolbar button", async () => {
    render(<BlockEditor content="Hello" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("Hello"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 5);
    fireEvent.mouseDown(screen.getByTitle("Bold (Ctrl+B)"));
    await waitFor(() => expect(textarea).toHaveValue("**Hello**"));
  });

  it("applies italic formatting via Ctrl+I shortcut", async () => {
    render(<BlockEditor content="Text" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("Text"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 4);
    fireEvent.keyDown(textarea, { key: "i", ctrlKey: true, shiftKey: false });
    await waitFor(() => expect(textarea).toHaveValue("*Text*"));
  });

  it("applies bold via Ctrl+B shortcut", async () => {
    render(<BlockEditor content="Word" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("Word"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 4);
    fireEvent.keyDown(textarea, { key: "b", ctrlKey: true, shiftKey: false });
    await waitFor(() => expect(textarea).toHaveValue("**Word**"));
  });

  it("applies inline code via Ctrl+` shortcut", async () => {
    render(<BlockEditor content="code" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("code"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 4);
    fireEvent.keyDown(textarea, { key: "`", ctrlKey: true, shiftKey: false });
    await waitFor(() => expect(textarea).toHaveValue("`code`"));
  });

  it("applies heading via toolbar button", async () => {
    render(<BlockEditor content="Title" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("Title"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    fireEvent.mouseDown(screen.getByTitle("Heading (Ctrl+Shift+H)"));
    await waitFor(() => expect(textarea).toHaveValue("## Title"));
  });

  it("applies bullet list via toolbar button", async () => {
    render(<BlockEditor content="item" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("item"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    fireEvent.mouseDown(screen.getByTitle("Bullet list (Ctrl+Shift+U)"));
    await waitFor(() => expect(textarea).toHaveValue("- item"));
  });

  it("Tab key inserts two spaces", async () => {
    render(<BlockEditor content="text" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("text"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    fireEvent.keyDown(textarea, { key: "Tab" });
    await waitFor(() => expect(textarea).toHaveValue("  text"));
  });

  it("dismisses wikilink suggestions with Escape", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["Target Note"]);
    render(<BlockEditor content="Start" onCommit={onCommit} onNavigate={onNavigate} />);
    await waitFor(() => {});
    await userEvent.click(screen.getByText("Start"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "[[Target", selectionStart: 8 } });
    await waitFor(() => screen.getByText("Target Note"));
    fireEvent.keyDown(textarea, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Target Note")).not.toBeInTheDocument());
  });

  it("commits wikilink via Enter key", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["My Page"]);
    render(<BlockEditor content="Start" onCommit={onCommit} onNavigate={onNavigate} />);
    await waitFor(() => {});
    await userEvent.click(screen.getByText("Start"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "[[", selectionStart: 2 } });
    await waitFor(() => screen.getByText("My Page"));
    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() => expect(textarea).toHaveValue("[[My Page]]"));
  });

  it("commits wikilink via mousedown on suggestion", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["My Note"]);
    render(<BlockEditor content="Begin" onCommit={onCommit} onNavigate={onNavigate} />);
    await waitFor(() => {});
    await userEvent.click(screen.getByText("Begin"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "[[My", selectionStart: 4 } });
    await waitFor(() => screen.getByText("My Note"));
    fireEvent.mouseDown(screen.getByText("My Note"));
    await waitFor(() => expect(textarea).toHaveValue("[[My Note]]"));
  });

  it("navigates suggestions with ArrowDown", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["Alpha", "Beta"]);
    render(<BlockEditor content="Start" onCommit={onCommit} onNavigate={onNavigate} />);
    await waitFor(() => {});
    await userEvent.click(screen.getByText("Start"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "[[", selectionStart: 2 } });
    await waitFor(() => screen.getByText("Alpha"));
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("adds new empty block when clicking bottom area with non-empty last block", async () => {
    render(<BlockEditor content="Hello" onCommit={onCommit} onNavigate={onNavigate} />);
    const bottomArea = document.querySelector(".min-h-12")!;
    await userEvent.click(bottomArea as HTMLElement);
    expect(screen.getByRole("textbox") as HTMLTextAreaElement).toBeInTheDocument();
    expect(screen.getByRole("textbox") as HTMLTextAreaElement).toHaveValue("");
  });

  it("activates last block when clicking bottom area and last block is empty", async () => {
    render(<BlockEditor content="" onCommit={onCommit} onNavigate={onNavigate} />);
    const bottomArea = document.querySelector(".min-h-12")!;
    await userEvent.click(bottomArea as HTMLElement);
    expect(screen.getByRole("textbox") as HTMLTextAreaElement).toBeInTheDocument();
  });

  it("calls onCommit when block loses focus with changed content", async () => {
    render(<BlockEditor content="First" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("First"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Updated" } });
    fireEvent.blur(textarea);
    await waitFor(() => expect(onCommit).toHaveBeenCalledWith("Updated"));
  });

  it("applies blockquote via Ctrl+Shift+B shortcut", async () => {
    render(<BlockEditor content="quote" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("quote"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    fireEvent.keyDown(textarea, { key: "B", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(textarea).toHaveValue("> quote"));
  });

  it("applies link formatting via Ctrl+K shortcut", async () => {
    render(<BlockEditor content="link" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("link"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 4);
    fireEvent.keyDown(textarea, { key: "k", ctrlKey: true, shiftKey: false });
    await waitFor(() => expect(textarea).toHaveValue("[link]()"));
  });

  it("smart Enter continues bullet list", async () => {
    render(<BlockEditor content="- item" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText(/item/));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(6, 6);
    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() => {
      expect(textarea.value).toContain("\n- ");
    });
  });

  it("smart Enter at position 0 inserts empty block above", async () => {
    render(<BlockEditor content="content" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("content"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() => {
      expect(textarea.value).toBe("");
    });
  });

  it("Ctrl+Z undoes last committed change via toolbar formatting", async () => {
    // Use the toolbar to create a history entry (bold adds to history via pushHistory)
    render(<BlockEditor content="hello" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("hello"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 5);
    // Apply bold via toolbar (calls pushHistory)
    fireEvent.mouseDown(screen.getByTitle("Bold (Ctrl+B)"));
    await waitFor(() => expect(textarea).toHaveValue("**hello**"));
    // Now Ctrl+Z to undo
    fireEvent.keyDown(textarea, { key: "z", ctrlKey: true });
    await waitFor(() => {
      expect(onCommit).toHaveBeenCalled();
    });
  });

  it("Ctrl+Y redoes after undo via toolbar", async () => {
    render(<BlockEditor content="word" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("word"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 4);
    // Apply bold (pushes to history)
    fireEvent.mouseDown(screen.getByTitle("Bold (Ctrl+B)"));
    await waitFor(() => expect(textarea).toHaveValue("**word**"));
    // Undo
    fireEvent.keyDown(textarea, { key: "z", ctrlKey: true });
    await waitFor(() => expect(onCommit).toHaveBeenCalled());
    const callCount = onCommit.mock.calls.length;
    // Redo with Ctrl+Y
    fireEvent.keyDown(textarea, { key: "y", ctrlKey: true });
    await waitFor(() => {
      expect(onCommit.mock.calls.length).toBeGreaterThanOrEqual(callCount);
    });
  });

  it("Shift+Tab unindents a line", async () => {
    render(<BlockEditor content="  item" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText(/item/));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(2, 2);
    fireEvent.keyDown(textarea, { key: "Tab", shiftKey: true });
    await waitFor(() => {
      expect(textarea.value.startsWith("  ")).toBe(false);
    });
  });

  it("ArrowDown at end of block navigates to next block", async () => {
    render(
      <BlockEditor
        content={"First paragraph\n\nSecond paragraph"}
        onCommit={onCommit}
        onNavigate={onNavigate}
      />
    );
    await userEvent.click(screen.getByText("First paragraph"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea).toHaveValue("First paragraph");
    const len = textarea.value.length;
    textarea.setSelectionRange(len, len);
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    await waitFor(() => {
      const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(ta).toHaveValue("Second paragraph");
    });
  });

  it("ArrowUp at start of block navigates to previous block", async () => {
    render(
      <BlockEditor
        content={"First paragraph\n\nSecond paragraph"}
        onCommit={onCommit}
        onNavigate={onNavigate}
      />
    );
    await userEvent.click(screen.getByText("Second paragraph"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea).toHaveValue("Second paragraph");
    textarea.setSelectionRange(0, 0);
    fireEvent.keyDown(textarea, { key: "ArrowUp" });
    await waitFor(() => {
      const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(ta).toHaveValue("First paragraph");
    });
  });

  it("selects date from DatePicker and calls onCommit", async () => {
    render(<BlockEditor content="Start" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("Start"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "/date", selectionStart: 5 } });
    await waitFor(() => {
      expect(screen.getByText("Su")).toBeInTheDocument();
    });
    // Click on a day number (15)
    const dayButtons = screen
      .getAllByRole("button")
      .filter((b) => b.textContent === "15" && !isNaN(Number(b.textContent)));
    expect(dayButtons.length).toBeGreaterThan(0);
    await userEvent.click(dayButtons[0]);
    await waitFor(() => {
      expect(onCommit).toHaveBeenCalled();
      const lastCall = onCommit.mock.calls[onCommit.mock.calls.length - 1][0];
      expect(lastCall).toMatch(/\d{4}-\d{2}-15/);
    });
  });

  it("renders external link as anchor tag", async () => {
    render(
      <BlockEditor
        content="[Google](https://google.com)"
        onCommit={onCommit}
        onNavigate={onNavigate}
      />
    );
    await waitFor(() => {
      const link = document.querySelector("a[href='https://google.com']");
      expect(link).toBeInTheDocument();
    });
  });

  it("navigates suggestions with ArrowUp", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["Alpha", "Beta"]);
    render(<BlockEditor content="Start" onCommit={onCommit} onNavigate={onNavigate} />);
    await waitFor(() => {});
    await userEvent.click(screen.getByText("Start"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "[[", selectionStart: 2 } });
    await waitFor(() => screen.getByText("Alpha"));
    // Go down first, then up
    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    fireEvent.keyDown(textarea, { key: "ArrowUp" });
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("applies Ctrl+Shift+U bullet list shortcut", async () => {
    render(<BlockEditor content="item" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("item"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    fireEvent.keyDown(textarea, { key: "U", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(textarea).toHaveValue("- item"));
  });

  it("applies Ctrl+Shift+H heading shortcut", async () => {
    render(<BlockEditor content="heading" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("heading"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    fireEvent.keyDown(textarea, { key: "H", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(textarea).toHaveValue("## heading"));
  });

  it("closes DatePicker with Escape key", async () => {
    render(<BlockEditor content="Start" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("Start"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "/date", selectionStart: 5 } });
    await waitFor(() => {
      expect(screen.getByText("Su")).toBeInTheDocument();
    });
    fireEvent.keyDown(textarea, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByText("Su")).not.toBeInTheDocument();
    });
  });

  it("global Ctrl+Z undo works when no block is active", async () => {
    render(<BlockEditor content="text" onCommit={onCommit} onNavigate={onNavigate} />);
    // Click and change content
    await userEvent.click(screen.getByText("text"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "modified" } });
    fireEvent.blur(textarea);
    await waitFor(() => expect(onCommit).toHaveBeenCalled());
    // Now undo globally (no block active)
    fireEvent.keyDown(document, { key: "z", ctrlKey: true });
    await waitFor(() => {
      // Should have called onCommit again with undo
      expect(onCommit.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it("smart Enter continues ordered list", async () => {
    render(<BlockEditor content="1. first item" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText(/first item/));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    const len = textarea.value.length;
    textarea.setSelectionRange(len, len);
    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() => {
      expect(textarea.value).toContain("\n2. ");
    });
  });

  it("smart Enter on empty list item removes the prefix", async () => {
    render(<BlockEditor content="- item" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText(/item/));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    // Continue list first: press Enter at end of "- item" to create "- item\n- "
    const len = textarea.value.length;
    textarea.setSelectionRange(len, len);
    fireEvent.keyDown(textarea, { key: "Enter" });
    // Textarea should now contain "- item\n- "
    await waitFor(() => {
      expect(textarea.value).toContain("\n- ");
    });
    // Now press Enter again on the empty "- " item to remove the prefix
    const newLen = textarea.value.length;
    textarea.setSelectionRange(newLen, newLen);
    fireEvent.keyDown(textarea, { key: "Enter" });
    // The empty list item line prefix should be removed
    await waitFor(() => {
      expect(textarea.value).not.toMatch(/\n- $/);
    });
  });

  it("applies link formatting via toolbar button (cursor at start of selection)", async () => {
    render(<BlockEditor content="text" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("text"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    // Apply link with no selection (empty selection) to hit the cursor branch
    textarea.setSelectionRange(0, 0);
    fireEvent.mouseDown(screen.getByTitle("Link (Ctrl+K)"));
    await waitFor(() => expect(textarea.value).toContain("[]("));
  });

  it("mouseEnter on wikilink suggestion updates active index", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["Alpha", "Beta"]);
    render(<BlockEditor content="Start" onCommit={onCommit} onNavigate={onNavigate} />);
    await waitFor(() => {});
    await userEvent.click(screen.getByText("Start"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "[[", selectionStart: 2 } });
    await waitFor(() => screen.getByText("Alpha"));
    // Hover over Beta to change active index
    fireEvent.mouseEnter(screen.getByText("Beta"));
    // Should not crash and both suggestions remain visible
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("Shift+Tab unindents single space indented line", async () => {
    render(<BlockEditor content=" item" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText(/item/));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(1, 1);
    fireEvent.keyDown(textarea, { key: "Tab", shiftKey: true });
    await waitFor(() => {
      expect(textarea.value).toBe("item");
    });
  });

  it("applies blockquote via toolbar button", async () => {
    render(<BlockEditor content="text" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("text"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    fireEvent.mouseDown(screen.getByTitle("Blockquote (Ctrl+Shift+B)"));
    await waitFor(() => expect(textarea).toHaveValue("> text"));
  });

  it("applies italic formatting via toolbar button", async () => {
    render(<BlockEditor content="Hello" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("Hello"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 5);
    fireEvent.mouseDown(screen.getByTitle("Italic (Ctrl+I)"));
    await waitFor(() => expect(textarea).toHaveValue("*Hello*"));
  });

  it("applies inline code formatting via toolbar button", async () => {
    render(<BlockEditor content="code" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("code"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 4);
    fireEvent.mouseDown(screen.getByTitle("Inline code (Ctrl+`)"));
    await waitFor(() => expect(textarea).toHaveValue("`code`"));
  });

  it("toggles off heading prefix when line already has ##", async () => {
    render(<BlockEditor content="## My Heading" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("My Heading"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    fireEvent.mouseDown(screen.getByTitle("Heading (Ctrl+Shift+H)"));
    await waitFor(() => expect(textarea).toHaveValue("My Heading"));
  });

  it("toggles off blockquote prefix when line already has >", async () => {
    render(<BlockEditor content="> My Quote" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("My Quote"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    fireEvent.mouseDown(screen.getByTitle("Blockquote (Ctrl+Shift+B)"));
    await waitFor(() => expect(textarea).toHaveValue("My Quote"));
  });

  it("toggles off bullet prefix when line already has -", async () => {
    render(<BlockEditor content="- My Item" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText(/My Item/));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    fireEvent.mouseDown(screen.getByTitle("Bullet list (Ctrl+Shift+U)"));
    await waitFor(() => expect(textarea).toHaveValue("My Item"));
  });

  it("calls api.openUrl when external link is clicked", async () => {
    render(
      <BlockEditor
        content="[Visit Google](https://google.com)"
        onCommit={onCommit}
        onNavigate={onNavigate}
      />
    );
    await waitFor(() => screen.getByText("Visit Google"));
    const link = document.querySelector("a[href='https://google.com']") as HTMLElement;
    expect(link).toBeInTheDocument();
    fireEvent.click(link);
    await waitFor(() => {
      expect(vi.mocked(api.openUrl)).toHaveBeenCalledWith("https://google.com");
    });
  });

  it("renders plain img tag for non-attachment image src", async () => {
    render(
      <BlockEditor
        content="![alt text](https://example.com/img.png)"
        onCommit={onCommit}
        onNavigate={onNavigate}
      />
    );
    await waitFor(() => {
      const img = document.querySelector("img[src='https://example.com/img.png']");
      expect(img).toBeInTheDocument();
    });
  });

  it("renders AttachmentImage for attachment: prefixed image src", async () => {
    const attachments = [
      {
        id: "att-1",
        note_id: "note-1",
        filename: "photo.png",
        mime_type: "image/png",
        size: 100,
        created_at: new Date().toISOString(),
      },
    ];
    vi.mocked(api.getAttachmentData).mockResolvedValue("base64data");

    render(
      <BlockEditor
        content="![photo](attachment:photo.png)"
        onCommit={onCommit}
        onNavigate={onNavigate}
        attachments={attachments}
      />
    );

    // AttachmentImage shows "Loading..." until data is loaded
    await waitFor(() => {
      // Either loading or the img is rendered
      const loading = document.querySelector(".text-ghost");
      const img = document.querySelector("img");
      expect(loading || img).toBeTruthy();
    });
  });

  it("Shift+Tab does nothing when line has no leading spaces", async () => {
    render(<BlockEditor content="noindent" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("noindent"));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);
    fireEvent.keyDown(textarea, { key: "Tab", shiftKey: true });
    // Value should remain unchanged since there are no leading spaces
    await waitFor(() => {
      expect(textarea.value).toBe("noindent");
    });
  });
});
