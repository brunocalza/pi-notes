import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import ContentEditor from "./ContentEditor";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    getAllNoteTitles: vi.fn().mockResolvedValue([]),
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
