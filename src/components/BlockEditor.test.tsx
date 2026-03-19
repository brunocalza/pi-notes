import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import BlockEditor from "./BlockEditor";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    getAllNoteTitles: vi.fn().mockResolvedValue([]),
    getNoteByTitle: vi.fn(),
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
    expect(screen.getByRole("textbox")).toHaveValue("Click me");
  });

  it("calls onCommit with updated content when textarea loses focus", async () => {
    render(<BlockEditor content="Original" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("Original"));

    const textarea = screen.getByRole("textbox");
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Updated");
    await userEvent.tab();

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith("Updated");
    });
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
    const textarea = screen.getByRole("textbox");
    // fireEvent.change bypasses userEvent's key-escaping for `[`
    fireEvent.change(textarea, { target: { value: "[[Target", selectionStart: 8 } });

    await waitFor(() => {
      expect(screen.getByText("Target Note")).toBeInTheDocument();
    });
  });

  it("shows DatePicker when /date command is typed in edit mode", async () => {
    render(<BlockEditor content="Start" onCommit={onCommit} onNavigate={onNavigate} />);
    await userEvent.click(screen.getByText("Start"));
    const textarea = screen.getByRole("textbox");
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
});
