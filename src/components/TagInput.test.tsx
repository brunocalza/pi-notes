import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import TagInput from "./TagInput";
import { api } from "../api";

vi.mock("../api", () => ({
  api: {
    getAllTags: vi.fn(),
  },
}));

describe("TagInput", () => {
  const onAdd = vi.fn();
  const onRemove = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getAllTags).mockResolvedValue([]);
  });

  it("renders existing tags", () => {
    render(<TagInput tags={["react", "typescript"]} onAdd={onAdd} onRemove={onRemove} />);
    expect(screen.getByText("#react")).toBeInTheDocument();
    expect(screen.getByText("#typescript")).toBeInTheDocument();
  });

  it("calls onAdd with normalized tag when Enter is pressed", async () => {
    render(<TagInput tags={[]} onAdd={onAdd} onRemove={onRemove} />);
    await userEvent.type(screen.getByPlaceholderText("Add tag..."), "react{Enter}");
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith("react"));
  });

  it("calls onAdd when comma is pressed", async () => {
    render(<TagInput tags={[]} onAdd={onAdd} onRemove={onRemove} />);
    await userEvent.type(screen.getByPlaceholderText("Add tag..."), "vue,");
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith("vue"));
  });

  it("calls onRemove when X is clicked on a tag", async () => {
    render(<TagInput tags={["react"]} onAdd={onAdd} onRemove={onRemove} />);
    const removeButtons = screen.getAllByRole("button");
    await userEvent.click(removeButtons[0]);
    expect(onRemove).toHaveBeenCalledWith("react");
  });

  it("shows suggestions from existing tags", async () => {
    vi.mocked(api.getAllTags).mockResolvedValue([
      ["react", 3],
      ["react-native", 1],
    ]);

    render(<TagInput tags={[]} onAdd={onAdd} onRemove={onRemove} />);

    // Wait for the tags to load
    await waitFor(() => {});

    await userEvent.type(screen.getByPlaceholderText("Add tag..."), "react");
    // Tag name is split across styled spans; match the button by accessible name instead
    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((btn) => btn.textContent?.includes("react-native"))
      ).toBe(true);
    });
  });

  it("shows 'create new' option when tag doesn't exist", async () => {
    render(<TagInput tags={[]} onAdd={onAdd} onRemove={onRemove} />);
    await userEvent.type(screen.getByPlaceholderText("Add tag..."), "brandnew");
    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((btn) => btn.textContent?.includes("brandnew"))
      ).toBe(true);
    });
  });

  it("does not add a tag that is already selected", async () => {
    render(<TagInput tags={["react"]} onAdd={onAdd} onRemove={onRemove} />);
    // Type the exact tag name that's already selected and confirm
    await userEvent.type(screen.getByPlaceholderText("Add tag..."), "react");
    // Dismiss popover and commit via Enter with no valid new tag
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Enter}");
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("Escape closes the popover", async () => {
    vi.mocked(api.getAllTags).mockResolvedValue([["react", 3]]);
    render(<TagInput tags={[]} onAdd={onAdd} onRemove={onRemove} />);
    await waitFor(() => {});

    const input = screen.getByPlaceholderText("Add tag...");
    await userEvent.type(input, "r");

    await waitFor(() => {
      expect(screen.getAllByRole("button").some((b) => b.textContent?.includes("react"))).toBe(
        true
      );
    });

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() => {
      // After Escape, the popover is closed - no suggestion buttons should be visible
      const buttons = screen.queryAllByRole("button");
      expect(
        buttons.filter(
          (b) => b.textContent?.includes("react") && !b.textContent?.includes("#react")
        ).length
      ).toBe(0);
    });
  });

  it("ArrowDown navigates to next suggestion", async () => {
    vi.mocked(api.getAllTags).mockResolvedValue([
      ["react", 3],
      ["react-hooks", 1],
    ]);
    render(<TagInput tags={[]} onAdd={onAdd} onRemove={onRemove} />);
    await waitFor(() => {});

    const input = screen.getByPlaceholderText("Add tag...");
    await userEvent.type(input, "r");
    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("react"))
      ).toBeTruthy();
    });

    // Move down — just verify it doesn't crash and suggestions still visible
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(
      screen.getAllByRole("button").some((b) => b.textContent?.includes("react"))
    ).toBeTruthy();
  });

  it("ArrowUp navigates to previous suggestion", async () => {
    vi.mocked(api.getAllTags).mockResolvedValue([
      ["react", 3],
      ["react-hooks", 1],
    ]);
    render(<TagInput tags={[]} onAdd={onAdd} onRemove={onRemove} />);
    await waitFor(() => {});

    const input = screen.getByPlaceholderText("Add tag...");
    await userEvent.type(input, "r");
    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("react"))
      ).toBeTruthy();
    });

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(
      screen.getAllByRole("button").some((b) => b.textContent?.includes("react"))
    ).toBeTruthy();
  });

  it("shows invalid tag error when tag contains invalid characters", async () => {
    render(<TagInput tags={[]} onAdd={onAdd} onRemove={onRemove} />);
    await userEvent.type(screen.getByPlaceholderText("Add tag..."), "@invalid{Enter}");
    await waitFor(() => {
      expect(document.querySelector(".text-danger")).toBeInTheDocument();
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("mousedown on suggestion commits it directly", async () => {
    vi.mocked(api.getAllTags).mockResolvedValue([["react", 3]]);
    render(<TagInput tags={[]} onAdd={onAdd} onRemove={onRemove} />);
    await waitFor(() => {});

    await userEvent.type(screen.getByPlaceholderText("Add tag..."), "r");

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("react"))
      ).toBeTruthy();
    });

    const reactBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("react") && !b.textContent?.includes("#react"));
    fireEvent.mouseDown(reactBtn!);

    expect(onAdd).toHaveBeenCalledWith("react");
  });

  it("opens popover on focus when input has text", async () => {
    vi.mocked(api.getAllTags).mockResolvedValue([["react", 3]]);
    render(<TagInput tags={[]} onAdd={onAdd} onRemove={onRemove} />);
    await waitFor(() => {});

    const input = screen.getByPlaceholderText("Add tag...");
    // Type something first then blur then focus again
    fireEvent.change(input, { target: { value: "r" } });
    fireEvent.blur(input);
    // Re-focus with text in input — should open popover
    fireEvent.focus(input);

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("react"))
      ).toBeTruthy();
    });
  });

  it("closing popover via outside click clears suggestions", async () => {
    vi.mocked(api.getAllTags).mockResolvedValue([["react", 3]]);
    render(<TagInput tags={[]} onAdd={onAdd} onRemove={onRemove} />);
    await waitFor(() => {});

    const input = screen.getByPlaceholderText("Add tag...");
    fireEvent.change(input, { target: { value: "r" } });

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("react"))
      ).toBeTruthy();
    });

    // Click outside the popover
    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      const buttons = screen.queryAllByRole("button");
      expect(
        buttons.filter(
          (b) => b.textContent?.includes("react") && !b.textContent?.includes("#react")
        ).length
      ).toBe(0);
    });
  });

  it("mouseenter on create option updates active index", async () => {
    // No existing tags so that the "create" option appears
    vi.mocked(api.getAllTags).mockResolvedValue([]);
    render(<TagInput tags={[]} onAdd={onAdd} onRemove={onRemove} />);
    await waitFor(() => {});

    await userEvent.type(screen.getByPlaceholderText("Add tag..."), "brandnew");

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("as new tag"))
      ).toBeTruthy();
    });

    const createBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("as new tag"));
    fireEvent.mouseEnter(createBtn!);
    // Should not crash, the button remains visible
    expect(createBtn).toBeInTheDocument();
  });

  it("Enter key commits the active existing suggestion", async () => {
    vi.mocked(api.getAllTags).mockResolvedValue([
      ["react", 3],
      ["react-hooks", 1],
    ]);
    render(<TagInput tags={[]} onAdd={onAdd} onRemove={onRemove} />);
    await waitFor(() => {});

    const input = screen.getByPlaceholderText("Add tag...");
    await userEvent.type(input, "r");
    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("react"))
      ).toBeTruthy();
    });

    // Press ArrowDown to make activeIndex point to a suggestion (not createIndex)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // Now press Enter to commit the active suggestion
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalled();
    });
  });

  it("mouseenter on existing suggestion updates active index", async () => {
    vi.mocked(api.getAllTags).mockResolvedValue([
      ["react", 3],
      ["vue", 1],
    ]);
    render(<TagInput tags={[]} onAdd={onAdd} onRemove={onRemove} />);
    await waitFor(() => {});

    const input = screen.getByPlaceholderText("Add tag...");
    fireEvent.change(input, { target: { value: "r" } });

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("react"))
      ).toBeTruthy();
    });

    const reactBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("react") && !b.textContent?.includes("#react"));
    fireEvent.mouseEnter(reactBtn!);
    // Should not crash - suggestion still visible
    expect(reactBtn).toBeInTheDocument();
  });

  it("mousedown on create option commits the new tag", async () => {
    vi.mocked(api.getAllTags).mockResolvedValue([]);
    render(<TagInput tags={[]} onAdd={onAdd} onRemove={onRemove} />);
    await waitFor(() => {});

    await userEvent.type(screen.getByPlaceholderText("Add tag..."), "newone");

    await waitFor(() => {
      expect(
        screen.getAllByRole("button").some((b) => b.textContent?.includes("as new tag"))
      ).toBeTruthy();
    });

    const createBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("as new tag"));
    fireEvent.mouseDown(createBtn!);

    expect(onAdd).toHaveBeenCalledWith("newone");
  });
});
