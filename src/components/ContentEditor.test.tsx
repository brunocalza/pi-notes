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
