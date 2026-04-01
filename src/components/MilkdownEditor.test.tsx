import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { createRef } from "react";
import { WikilinkEditPopover } from "./MilkdownEditor";

// Mock Milkdown and heavy deps so jsdom doesn't choke
vi.mock("@milkdown/core", () => ({
  Editor: { make: () => ({ config: () => ({ use: () => ({}) }) }) },
  defaultValueCtx: Symbol("defaultValueCtx"),
  editorViewCtx: Symbol("editorViewCtx"),
  rootCtx: Symbol("rootCtx"),
  rootAttrsCtx: Symbol("rootAttrsCtx"),
  nodeViewCtx: Symbol("nodeViewCtx"),
  prosePluginsCtx: Symbol("prosePluginsCtx"),
}));
vi.mock("@milkdown/react", () => ({
  Milkdown: () => null,
  MilkdownProvider: ({ children }: { children: React.ReactNode }) => children,
  useEditor: () => ({ get: () => null }),
}));
vi.mock("@milkdown/preset-commonmark", () => ({ commonmark: [] }));
vi.mock("@milkdown/preset-gfm", () => ({ gfm: [] }));
vi.mock("@milkdown/plugin-history", () => ({ history: [] }));
vi.mock("@milkdown/plugin-indent", () => ({
  indent: [],
  indentConfig: { key: Symbol("indentConfig") },
}));
vi.mock("@milkdown/plugin-clipboard", () => ({ clipboard: [] }));
vi.mock("@milkdown/plugin-trailing", () => ({ trailing: [] }));
vi.mock("@milkdown/plugin-math", () => ({ math: [] }));
vi.mock("@milkdown/plugin-prism", () => ({
  prism: [],
  prismConfig: { key: Symbol("prismConfig") },
}));
vi.mock("refractor/all", () => ({ refractor: {} }));
vi.mock("@milkdown/plugin-listener", () => ({
  listener: [],
  listenerCtx: Symbol("listenerCtx"),
}));
vi.mock("@milkdown/plugin-tooltip", () => ({
  tooltipFactory: () => ({ key: Symbol("tooltip") }),
  TooltipProvider: vi.fn(),
}));
vi.mock("@milkdown/plugin-slash", () => ({
  slashFactory: () => ({ key: Symbol("slash") }),
  SlashProvider: vi.fn(),
}));
vi.mock("@milkdown/utils", () => ({ replaceAll: vi.fn() }));
vi.mock("prosemirror-view", () => ({
  EditorView: vi.fn(),
}));
vi.mock("prosemirror-state", () => ({
  Plugin: vi.fn(),
  TextSelection: { create: vi.fn() },
}));
vi.mock("prosemirror-commands", () => ({ toggleMark: vi.fn() }));
vi.mock("react-dom/client", () => ({ createRoot: vi.fn(() => ({ render: vi.fn() })) }));
vi.mock("node-emoji", () => ({
  get: vi.fn(),
  search: vi.fn(() => []),
}));
vi.mock("../api", () => ({
  api: {
    getAllNoteTitles: vi.fn().mockResolvedValue([]),
    getNoteByTitle: vi.fn(),
    insertNote: vi.fn().mockResolvedValue("new-id"),
    getAttachmentData: vi.fn().mockResolvedValue("base64data"),
    openUrl: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("WikilinkEditPopover", () => {
  const defaultProps = {
    rect: { top: 100, bottom: 120, left: 200 },
    query: "",
    activeIdx: 0,
    allTitles: ["Alpha Note", "Beta Note", "Gamma Note", "Another Alpha"],
    popoverRef: createRef<HTMLDivElement>(),
    onQueryChange: vi.fn(),
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onActiveIdxChange: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it("renders search input with placeholder", () => {
    render(<WikilinkEditPopover {...defaultProps} />);
    expect(screen.getByPlaceholderText("Search notes…")).toBeInTheDocument();
  });

  it("shows all titles when query is empty", () => {
    render(<WikilinkEditPopover {...defaultProps} />);
    expect(screen.getByText("Alpha Note")).toBeInTheDocument();
    expect(screen.getByText("Beta Note")).toBeInTheDocument();
    expect(screen.getByText("Gamma Note")).toBeInTheDocument();
    expect(screen.getByText("Another Alpha")).toBeInTheDocument();
  });

  it("filters titles by query", () => {
    render(<WikilinkEditPopover {...defaultProps} query="alpha" />);
    expect(screen.getByText("Alpha Note")).toBeInTheDocument();
    expect(screen.getByText("Another Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta Note")).not.toBeInTheDocument();
    expect(screen.queryByText("Gamma Note")).not.toBeInTheDocument();
  });

  it("calls onQueryChange when typing", async () => {
    render(<WikilinkEditPopover {...defaultProps} />);
    const input = screen.getByPlaceholderText("Search notes…");
    await userEvent.type(input, "x");
    expect(defaultProps.onQueryChange).toHaveBeenCalledWith("x");
  });

  it("calls onSelect when clicking a title", () => {
    render(<WikilinkEditPopover {...defaultProps} />);
    fireEvent.mouseDown(screen.getByText("Beta Note"));
    expect(defaultProps.onSelect).toHaveBeenCalledWith("Beta Note");
  });

  it("calls onClose on Escape key", async () => {
    render(<WikilinkEditPopover {...defaultProps} />);
    const input = screen.getByPlaceholderText("Search notes…");
    await userEvent.type(input, "{Escape}");
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("calls onSelect with active item on Enter", () => {
    render(<WikilinkEditPopover {...defaultProps} activeIdx={1} />);
    const input = screen.getByPlaceholderText("Search notes…");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(defaultProps.onSelect).toHaveBeenCalledWith("Beta Note");
  });

  it("calls onActiveIdxChange on ArrowDown", () => {
    render(<WikilinkEditPopover {...defaultProps} activeIdx={0} />);
    const input = screen.getByPlaceholderText("Search notes…");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(defaultProps.onActiveIdxChange).toHaveBeenCalledWith(1);
  });

  it("wraps ArrowDown to 0 at the end", () => {
    render(<WikilinkEditPopover {...defaultProps} activeIdx={3} />);
    const input = screen.getByPlaceholderText("Search notes…");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(defaultProps.onActiveIdxChange).toHaveBeenCalledWith(0);
  });

  it("calls onActiveIdxChange on ArrowUp", () => {
    render(<WikilinkEditPopover {...defaultProps} activeIdx={2} />);
    const input = screen.getByPlaceholderText("Search notes…");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(defaultProps.onActiveIdxChange).toHaveBeenCalledWith(1);
  });

  it("wraps ArrowUp to last item when at 0", () => {
    render(<WikilinkEditPopover {...defaultProps} activeIdx={0} />);
    const input = screen.getByPlaceholderText("Search notes…");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(defaultProps.onActiveIdxChange).toHaveBeenCalledWith(3);
  });

  it("calls onActiveIdxChange on mouse enter over an item", async () => {
    render(<WikilinkEditPopover {...defaultProps} />);
    await userEvent.hover(screen.getByText("Gamma Note"));
    expect(defaultProps.onActiveIdxChange).toHaveBeenCalledWith(2);
  });

  it("highlights the active item", () => {
    render(<WikilinkEditPopover {...defaultProps} activeIdx={1} />);
    const activeButton = screen.getByText("Beta Note").closest("button")!;
    expect(activeButton.className).toContain("bg-raised");
  });

  it("positions popover based on rect", () => {
    render(<WikilinkEditPopover {...defaultProps} />);
    const popover = defaultProps.popoverRef.current!;
    expect(popover.style.left).toBe("200px");
    expect(popover.style.top).toBe("124px"); // bottom (120) + 4
  });

  it("limits filtered results to 8", () => {
    const manyTitles = Array.from({ length: 20 }, (_, i) => `Note ${i}`);
    render(<WikilinkEditPopover {...defaultProps} allTitles={manyTitles} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(8);
  });

  it("does not call onSelect on Enter when no results match", () => {
    render(<WikilinkEditPopover {...defaultProps} query="zzz" />);
    const input = screen.getByPlaceholderText("Search notes…");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(defaultProps.onSelect).not.toHaveBeenCalled();
  });
});

describe("MilkdownEditor", () => {
  // MilkdownEditor relies heavily on the Milkdown runtime which can't run in jsdom.
  // We test that it renders without crashing with the mocked deps.
  it("renders without crashing", async () => {
    // Dynamic import to ensure mocks are in place
    const { default: MilkdownEditor } = await import("./MilkdownEditor");
    const { container } = render(
      <MilkdownEditor content="Hello" onCommit={vi.fn()} onNavigate={vi.fn()} />
    );
    expect(container.querySelector(".relative")).toBeInTheDocument();
  });

  it("accepts attachments prop without crashing", async () => {
    const { default: MilkdownEditor } = await import("./MilkdownEditor");
    render(
      <MilkdownEditor
        content="Test"
        onCommit={vi.fn()}
        onNavigate={vi.fn()}
        attachments={[
          {
            id: "att-1",
            note_id: "note-1",
            filename: "photo.png",
            mime_type: "image/png",
            size: 1024,
            created_at: new Date().toISOString(),
          },
        ]}
      />
    );
    // Just verifying no crash with attachments prop
    expect(document.body).toBeTruthy();
  });

  it("accepts onDateSelect prop without crashing", async () => {
    const { default: MilkdownEditor } = await import("./MilkdownEditor");
    render(
      <MilkdownEditor content="" onCommit={vi.fn()} onNavigate={vi.fn()} onDateSelect={vi.fn()} />
    );
    expect(document.body).toBeTruthy();
  });
});
