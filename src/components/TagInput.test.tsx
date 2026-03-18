import { render, screen, waitFor } from "@testing-library/react";
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
});
