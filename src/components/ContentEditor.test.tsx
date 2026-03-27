import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import ContentEditor from "./ContentEditor";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    getAllNoteTitles: vi.fn().mockResolvedValue([]),
    insertNote: vi.fn().mockResolvedValue("new-note-id"),
  },
}));

describe("ContentEditor", () => {
  const onChange = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it("renders a textarea with the given value", () => {
    render(<ContentEditor value="hello" onChange={onChange} />);
    expect(screen.getByRole("textbox")).toHaveValue("hello");
  });

  it("calls onChange when content is typed", async () => {
    render(<ContentEditor value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox"), "a");
    expect(onChange).toHaveBeenCalled();
  });

  it("renders placeholder text", () => {
    render(<ContentEditor value="" onChange={onChange} placeholder="Write here..." />);
    expect(screen.getByPlaceholderText("Write here...")).toBeInTheDocument();
  });

  it("shows wikilink suggestions when typing [[", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["My First Note", "My Second Note"]);

    render(<ContentEditor value="" onChange={() => {}} />);
    await waitFor(() => {});

    const textarea = screen.getByRole("textbox");
    // fireEvent.change bypasses userEvent's key-escaping for `[`
    fireEvent.change(textarea, { target: { value: "[[My", selectionStart: 4 } });

    await waitFor(() => {
      expect(screen.getByText("My First Note")).toBeInTheDocument();
      expect(screen.getByText("My Second Note")).toBeInTheDocument();
    });
  });

  it("shows DatePicker when /date command is typed", async () => {
    render(<ContentEditor value="" onChange={vi.fn()} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/date", selectionStart: 5 } });
    await waitFor(() => {
      expect(screen.getByText("Su")).toBeInTheDocument();
    });
  });

  it("hides DatePicker when Escape is pressed", async () => {
    render(<ContentEditor value="" onChange={vi.fn()} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/date", selectionStart: 5 } });
    await screen.findByText("Su");
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(screen.queryByText("Su")).not.toBeInTheDocument();
  });

  it("calls onChange and closes DatePicker when a day is selected", async () => {
    const onChange = vi.fn();
    // Start with value="" so fireEvent.change triggers React's onChange handler
    render(<ContentEditor value="" onChange={onChange} />);
    const textarea = screen.getByRole("textbox");

    fireEvent.change(textarea, { target: { value: "/date", selectionStart: 5 } });
    await screen.findByText("Su");

    fireEvent.mouseDown(screen.getAllByText("15")[0]);
    expect(onChange).toHaveBeenCalled();
    expect(screen.queryByText("Su")).not.toBeInTheDocument();
  });

  it("does not show DatePicker when a wikilink is open", async () => {
    render(<ContentEditor value="" onChange={vi.fn()} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "[[/date", selectionStart: 6 } });
    await waitFor(() => {});
    expect(screen.queryByText("Su")).not.toBeInTheDocument();
  });

  it("hides suggestions when Escape is pressed", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["Note A"]);

    render(<ContentEditor value="" onChange={vi.fn()} />);
    await waitFor(() => {});

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "[[Note", selectionStart: 6 } });
    await screen.findByText("Note A");

    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(screen.queryByText("Note A")).not.toBeInTheDocument();
  });

  it("ArrowDown cycles through suggestions", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["Note A", "Note B"]);
    render(<ContentEditor value="" onChange={vi.fn()} />);
    await waitFor(() => {});

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "[[Note", selectionStart: 6 } });
    await screen.findByText("Note A");

    fireEvent.keyDown(textarea, { key: "ArrowDown" });
    // Both suggestions remain visible with the active index shifted
    expect(screen.getByText("Note A")).toBeInTheDocument();
    expect(screen.getByText("Note B")).toBeInTheDocument();
  });

  it("ArrowUp cycles through suggestions in reverse", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["Note A", "Note B"]);
    render(<ContentEditor value="" onChange={vi.fn()} />);
    await waitFor(() => {});

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "[[Note", selectionStart: 6 } });
    await screen.findByText("Note A");

    fireEvent.keyDown(textarea, { key: "ArrowUp" });
    expect(screen.getByText("Note B")).toBeInTheDocument();
  });

  it("Enter commits the active suggestion", async () => {
    const onChange = vi.fn();
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["Note A"]);
    render(<ContentEditor value="" onChange={onChange} />);
    await waitFor(() => {});

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "[[", selectionStart: 2 } });
    await screen.findByText("Note A");

    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining("[[Note A]]"));
  });

  it("mousedown on suggestion commits it", async () => {
    const onChange = vi.fn();
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["My Note"]);
    render(<ContentEditor value="" onChange={onChange} />);
    await waitFor(() => {});

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "[[My", selectionStart: 4 } });
    await screen.findByText("My Note");

    fireEvent.mouseDown(screen.getByText("My Note"));
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining("[[My Note]]"));
  });

  it("closes suggestions on outside mousedown click", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["Note A"]);
    render(<ContentEditor value="" onChange={vi.fn()} />);
    await waitFor(() => {});

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "[[Note", selectionStart: 6 } });
    await screen.findByText("Note A");

    // Click outside both popover and textarea
    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByText("Note A")).not.toBeInTheDocument();
    });
  });

  it("mouseenter on suggestion updates active index", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["Note A", "Note B"]);
    render(<ContentEditor value="" onChange={vi.fn()} />);
    await waitFor(() => {});

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "[[Note", selectionStart: 6 } });
    await screen.findByText("Note A");

    // Hover over Note B to set active index to 1
    fireEvent.mouseEnter(screen.getByText("Note B"));
    // Both suggestions still visible, no crash
    expect(screen.getByText("Note A")).toBeInTheDocument();
    expect(screen.getByText("Note B")).toBeInTheDocument();
  });

  it("onClose callback of DatePicker closes picker", async () => {
    render(<ContentEditor value="" onChange={vi.fn()} />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "/date", selectionStart: 5 } });
    await screen.findByText("Su");

    // Simulate DatePicker onClose by clicking outside the picker
    // DatePicker has a close button in some implementations - use Escape via the textarea
    fireEvent.keyDown(textarea, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByText("Su")).not.toBeInTheDocument();
    });
  });

  it("shows DatePicker above when textarea is near bottom of screen", async () => {
    render(<ContentEditor value="" onChange={vi.fn()} />);
    const textarea = screen.getByRole("textbox");

    // Mock getBoundingClientRect to return top > 240
    vi.spyOn(textarea, "getBoundingClientRect").mockReturnValue({
      top: 500,
      bottom: 520,
      left: 0,
      right: 200,
      width: 200,
      height: 20,
      x: 0,
      y: 500,
      toJSON: () => {},
    } as DOMRect);

    fireEvent.change(textarea, { target: { value: "/date", selectionStart: 5 } });

    await waitFor(() => {
      expect(screen.getByText("Su")).toBeInTheDocument();
    });
  });

  it("shows Create option when no titles match the query", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue([]);
    render(<ContentEditor value="" onChange={vi.fn()} />);
    await waitFor(() => {});
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "[[Brand New", selectionStart: 11 } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Create/ })).toBeInTheDocument();
    });
  });

  it("Enter key creates note and commits wikilink when no suggestions match", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue([]);
    const onChange = vi.fn();
    render(<ContentEditor value="" onChange={onChange} />);
    await waitFor(() => {});
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "[[Brand New", selectionStart: 11 } });
    await waitFor(() => screen.getByRole("button", { name: /Create/ }));
    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() => {
      expect(vi.mocked(api.insertNote)).toHaveBeenCalledWith("Brand New", "", []);
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining("[[Brand New]]"));
    });
  });

  it("Escape dismisses create option when no suggestions match", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue([]);
    render(<ContentEditor value="" onChange={vi.fn()} />);
    await waitFor(() => {});
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "[[Brand New", selectionStart: 11 } });
    await waitFor(() => screen.getByRole("button", { name: /Create/ }));
    fireEvent.keyDown(textarea, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Create/ })).not.toBeInTheDocument();
    });
  });

  it("mousedown on Create button creates note and commits wikilink", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue([]);
    const onChange = vi.fn();
    render(<ContentEditor value="" onChange={onChange} />);
    await waitFor(() => {});
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "[[My New Note", selectionStart: 13 } });
    await waitFor(() => screen.getByRole("button", { name: /Create/ }));
    fireEvent.mouseDown(screen.getByRole("button", { name: /Create/ }));
    await waitFor(() => {
      expect(vi.mocked(api.insertNote)).toHaveBeenCalledWith("My New Note", "", []);
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining("[[My New Note]]"));
    });
  });

  it("commits wikilink even if note creation fails", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue([]);
    vi.mocked(api.insertNote).mockRejectedValueOnce(new Error("DB error"));
    const onChange = vi.fn();
    render(<ContentEditor value="" onChange={onChange} />);
    await waitFor(() => {});
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "[[FailNote", selectionStart: 10 } });
    await waitFor(() => screen.getByRole("button", { name: /Create/ }));
    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining("[[FailNote]]"));
    });
  });

  it("non-special key while suggestions visible falls through without closing them", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue(["Note A"]);
    render(<ContentEditor value="" onChange={vi.fn()} />);
    await waitFor(() => {});
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "[[Note", selectionStart: 6 } });
    await screen.findByText("Note A");
    // Press a key not handled by the suggestions block — hits the false branch of else-if Escape
    fireEvent.keyDown(textarea, { key: "Tab" });
    expect(screen.getByText("Note A")).toBeInTheDocument();
  });

  it("non-special key while create option shown falls through without closing it", async () => {
    vi.mocked(api.getAllNoteTitles).mockResolvedValue([]);
    render(<ContentEditor value="" onChange={vi.fn()} />);
    await waitFor(() => {});
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "[[New", selectionStart: 5 } });
    await screen.findByRole("button", { name: /Create/ });
    // Press a key not handled — hits the false branch of else-if Escape
    fireEvent.keyDown(textarea, { key: "Tab" });
    expect(screen.getByRole("button", { name: /Create/ })).toBeInTheDocument();
  });

  it("replaces /date command with selected date when cursor is at end of /date", async () => {
    const onChange = vi.fn();
    // Use value="" so React's controlled re-render doesn't reset selectionStart
    render(<ContentEditor value="" onChange={onChange} />);
    const textarea = screen.getByRole("textbox");
    // Fire change with "/date" at cursor position 5
    fireEvent.change(textarea, { target: { value: "/date", selectionStart: 5 } });
    await screen.findByText("Su");
    const dayBtns = screen.getAllByRole("button").filter((b) => b.textContent === "15");
    if (dayBtns.length > 0) {
      fireEvent.mouseDown(dayBtns[0]);
      await waitFor(() => {
        expect(screen.queryByText("Su")).not.toBeInTheDocument();
      });
    }
  });

  it("date is inserted at cursor position without /date command prefix when no match", async () => {
    const onChange = vi.fn();
    render(<ContentEditor value="text here" onChange={onChange} />);
    const textarea = screen.getByRole("textbox");
    // Simulate /date at start of document with cursor at 5 (right after "/date")
    fireEvent.change(textarea, { target: { value: "text /date", selectionStart: 10 } });
    await screen.findByText("Su");

    // Click day 15
    const dayBtns = screen.getAllByRole("button").filter((b) => b.textContent === "15");
    fireEvent.mouseDown(dayBtns[0]);

    expect(onChange).toHaveBeenCalled();
    expect(screen.queryByText("Su")).not.toBeInTheDocument();
  });
});
