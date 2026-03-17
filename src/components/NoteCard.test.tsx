import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import NoteCard from "./NoteCard";
import { makeNote } from "../test/fixtures";

describe("NoteCard", () => {
  it("renders title and snippet", () => {
    const note = makeNote({ title: "My Note", content: "Some content here" });
    render(<NoteCard note={note} selected={false} onClick={vi.fn()} onTagClick={vi.fn()} />);

    expect(screen.getByText("My Note")).toBeInTheDocument();
    expect(screen.getByText("Some content here")).toBeInTheDocument();
  });

  it("renders 'Untitled' when title is empty", () => {
    render(<NoteCard note={makeNote({ title: "" })} selected={false} onClick={vi.fn()} onTagClick={vi.fn()} />);
    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("strips markdown from content snippet", () => {
    const note = makeNote({ content: "**bold** and *italic* and `code`" });
    render(<NoteCard note={note} selected={false} onClick={vi.fn()} onTagClick={vi.fn()} />);
    expect(screen.getByText("bold and italic and")).toBeInTheDocument();
  });

  it("renders tags", () => {
    const note = makeNote({ tags: ["react", "typescript"] });
    render(<NoteCard note={note} selected={false} onClick={vi.fn()} onTagClick={vi.fn()} />);
    expect(screen.getByText("#react")).toBeInTheDocument();
    expect(screen.getByText("#typescript")).toBeInTheDocument();
  });

  it("shows overflow indicator when note has more than 4 tags", () => {
    const note = makeNote({ tags: ["a", "b", "c", "d", "e"] });
    render(<NoteCard note={note} selected={false} onClick={vi.fn()} onTagClick={vi.fn()} />);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("calls onClick when card is clicked", async () => {
    const onClick = vi.fn();
    render(<NoteCard note={makeNote()} selected={false} onClick={onClick} onTagClick={vi.fn()} />);
    await userEvent.click(screen.getByText("Test Note"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("calls onTagClick with tag name when tag is clicked", async () => {
    const onTagClick = vi.fn();
    const note = makeNote({ tags: ["react"] });
    render(<NoteCard note={note} selected={false} onClick={vi.fn()} onTagClick={onTagClick} />);
    await userEvent.click(screen.getByText("#react"));
    expect(onTagClick).toHaveBeenCalledWith("react");
  });

  it("does not call onClick when tag is clicked", async () => {
    const onClick = vi.fn();
    const note = makeNote({ tags: ["react"] });
    render(<NoteCard note={note} selected={false} onClick={onClick} onTagClick={vi.fn()} />);
    await userEvent.click(screen.getByText("#react"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
