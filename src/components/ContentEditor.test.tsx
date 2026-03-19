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
});
