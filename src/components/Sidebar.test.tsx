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
    getDaysWithNotesInMonth: vi.fn().mockResolvedValue([]),
  },
}));

const defaultProps = {
  view: "all" as const,
  tags: [] as [string, number][],
  inboxCount: 0,
  theme: "dark" as const,
  colorTheme: "graphite" as const,
  refreshKey: 0,
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
    const badge = document.querySelector(".bg-inbox-badge");
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toBe("3");
  });

  it("hides inbox count badge when count is 0", () => {
    render(<Sidebar {...defaultProps} inboxCount={0} />);
    expect(document.querySelector(".bg-inbox-badge")).not.toBeInTheDocument();
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

describe("Sidebar calendar", () => {
  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getDaysWithNotesInMonth).mockResolvedValue([]);
  });

  it("shows current month and year", () => {
    const now = new Date();
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText(`${MONTHS[now.getMonth()]} ${now.getFullYear()}`)).toBeInTheDocument();
  });

  it("calls getDaysWithNotesInMonth with current year-month on mount", async () => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => {
      expect(api.getDaysWithNotesInMonth).toHaveBeenCalledWith(`${now.getFullYear()}-${mm}`);
    });
  });

  it("refetches dots when refreshKey changes", async () => {
    const { rerender } = render(<Sidebar {...defaultProps} refreshKey={0} />);
    await waitFor(() => expect(api.getDaysWithNotesInMonth).toHaveBeenCalledTimes(1));
    rerender(<Sidebar {...defaultProps} refreshKey={1} />);
    await waitFor(() => expect(api.getDaysWithNotesInMonth).toHaveBeenCalledTimes(2));
  });

  it("calls onViewChange with { date } when a day is clicked", async () => {
    const onViewChange = vi.fn();
    const now = new Date();
    const year = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    render(<Sidebar {...defaultProps} onViewChange={onViewChange} />);
    // "10" never appears in leading/trailing padding (at most 6 days from adjacent month)
    await userEvent.click(screen.getAllByText("10")[0]);
    expect(onViewChange).toHaveBeenCalledWith({ date: `${year}-${mm}-10` });
  });

  it("navigates to next month and refetches dots", async () => {
    const now = new Date();
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => expect(api.getDaysWithNotesInMonth).toHaveBeenCalledTimes(1));

    // buttons[0]=today, buttons[1]=prev, buttons[2]=next, then day cells
    const buttons = screen.getAllByRole("button");
    await userEvent.click(buttons[2]);

    const nextMonth = (now.getMonth() + 1) % 12;
    const nextYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    await waitFor(() => {
      expect(screen.getByText(`${MONTHS[nextMonth]} ${nextYear}`)).toBeInTheDocument();
      expect(api.getDaysWithNotesInMonth).toHaveBeenCalledTimes(2);
    });
  });

  it("navigates to previous month and refetches dots", async () => {
    const now = new Date();
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => expect(api.getDaysWithNotesInMonth).toHaveBeenCalledTimes(1));

    // buttons[0]=today, buttons[1]=prev, buttons[2]=next, then day cells
    const buttons = screen.getAllByRole("button");
    await userEvent.click(buttons[1]);

    const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
    const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    await waitFor(() => {
      expect(screen.getByText(`${MONTHS[prevMonth]} ${prevYear}`)).toBeInTheDocument();
      expect(api.getDaysWithNotesInMonth).toHaveBeenCalledTimes(2);
    });
  });

  it("renders a dot for each day returned by getDaysWithNotesInMonth", async () => {
    vi.mocked(api.getDaysWithNotesInMonth).mockResolvedValue([5, 15, 20]);
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => {
      const visibleDots = Array.from(document.querySelectorAll(".rounded-full")).filter(
        (el) => !el.classList.contains("invisible")
      );
      expect(visibleDots.length).toBe(3);
    });
  });
});
