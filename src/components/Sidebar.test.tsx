import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Sidebar from "./Sidebar";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    renameTag: vi.fn(),
    deleteTag: vi.fn(),
    getDbPathSetting: vi.fn().mockResolvedValue("/home/user/.local/share/pi-notes/notes.db"),
  },
}));

const defaultProps = {
  view: "all" as const,
  tags: [] as [string, number][],
  inboxCount: 0,
  theme: "dark" as const,
  colorTheme: "graphite" as const,
  onViewChange: vi.fn(),
  onTagRename: vi.fn(),
  onTagDelete: vi.fn(),
  onThemeToggle: vi.fn(),
  onColorThemeChange: vi.fn(),
  onDbPathChange: vi.fn(),
};

describe("Sidebar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nav items", () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText("Inbox")).toBeInTheDocument();
    expect(screen.getByText("My Notes")).toBeInTheDocument();
    expect(screen.getByText("Trash")).toBeInTheDocument();
  });

  it("shows inbox count badge when count > 0", () => {
    render(<Sidebar {...defaultProps} inboxCount={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("hides inbox count badge when count is 0", () => {
    render(<Sidebar {...defaultProps} inboxCount={0} />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("calls onViewChange with correct view when nav items are clicked", async () => {
    const onViewChange = vi.fn();
    render(<Sidebar {...defaultProps} onViewChange={onViewChange} />);

    await userEvent.click(screen.getByText("Inbox"));
    expect(onViewChange).toHaveBeenCalledWith("inbox");

    await userEvent.click(screen.getByText("My Notes"));
    expect(onViewChange).toHaveBeenCalledWith("all");

    await userEvent.click(screen.getByText("Trash"));
    expect(onViewChange).toHaveBeenCalledWith("trash");
  });

  it("renders tags list", () => {
    const tags: [string, number][] = [
      ["react", 3],
      ["typescript", 1],
    ];
    render(<Sidebar {...defaultProps} tags={tags} />);
    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("typescript")).toBeInTheDocument();
  });

  it("calls onViewChange with tag when a tag is clicked", async () => {
    const onViewChange = vi.fn();
    const tags: [string, number][] = [["react", 2]];
    render(<Sidebar {...defaultProps} tags={tags} onViewChange={onViewChange} />);

    await userEvent.click(screen.getByText("react"));
    expect(onViewChange).toHaveBeenCalledWith({ tag: "react" });
  });

  it("calls renameTag and onTagRename after renaming a tag", async () => {
    vi.mocked(api.renameTag).mockResolvedValue(undefined);
    const onTagRename = vi.fn();
    const tags: [string, number][] = [["oldtag", 1]];
    render(<Sidebar {...defaultProps} tags={tags} onTagRename={onTagRename} />);

    await userEvent.hover(screen.getByText("oldtag"));
    await userEvent.click(screen.getByTitle("Rename tag"));

    const input = screen.getByDisplayValue("oldtag");
    await userEvent.clear(input);
    await userEvent.type(input, "newtag{Enter}");

    await waitFor(() => {
      expect(api.renameTag).toHaveBeenCalledWith("oldtag", "newtag");
      expect(onTagRename).toHaveBeenCalled();
    });
  });

  it("calls deleteTag and onTagDelete when delete is clicked", async () => {
    vi.mocked(api.deleteTag).mockResolvedValue(undefined);
    const onTagDelete = vi.fn();
    const tags: [string, number][] = [["mytag", 1]];
    render(<Sidebar {...defaultProps} tags={tags} onTagDelete={onTagDelete} />);

    await userEvent.hover(screen.getByText("mytag"));
    await userEvent.click(screen.getByTitle("Delete tag"));

    await waitFor(() => {
      expect(api.deleteTag).toHaveBeenCalledWith("mytag");
      expect(onTagDelete).toHaveBeenCalled();
    });
  });

  it("shows settings panel when Settings button is clicked", async () => {
    render(<Sidebar {...defaultProps} />);
    await userEvent.click(screen.getByText("Settings"));
    expect(screen.getByText("Appearance")).toBeInTheDocument();
  });
});
