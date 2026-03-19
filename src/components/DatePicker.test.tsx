import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import DatePicker from "./DatePicker";

// Fix time to March 19, 2026 — a Thursday; March 1 is a Sunday (no leading padding).
const FIXED_DATE = new Date(2026, 2, 19);

describe("DatePicker", () => {
  const onSelect = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_DATE);
  });

  afterEach(() => vi.useRealTimers());

  it("renders current month and year", () => {
    render(<DatePicker onSelect={onSelect} onClose={onClose} />);
    expect(screen.getByText("March 2026")).toBeInTheDocument();
  });

  it("renders weekday labels", () => {
    render(<DatePicker onSelect={onSelect} onClose={onClose} />);
    for (const wd of ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]) {
      expect(screen.getByText(wd)).toBeInTheDocument();
    }
  });

  it("calls onSelect with YYYY-MM-DD and onClose when a current-month day is clicked", () => {
    render(<DatePicker onSelect={onSelect} onClose={onClose} />);
    // March 2026 starts Sunday → no leading padding; "15" appears only once
    fireEvent.mouseDown(screen.getByText("15"));
    expect(onSelect).toHaveBeenCalledWith("2026-03-15");
    expect(onClose).toHaveBeenCalled();
  });

  it("zero-pads single-digit months and days", () => {
    render(<DatePicker onSelect={onSelect} onClose={onClose} />);
    fireEvent.mouseDown(screen.getByText("5"));
    expect(onSelect).toHaveBeenCalledWith("2026-03-05");
  });

  it("does not call onSelect for overflow (non-current-month) days", () => {
    render(<DatePicker onSelect={onSelect} onClose={onClose} />);
    // March 2026: 0 leading + 31 current + 4 overflow (Apr 1-4).
    // "1" appears twice: March 1 and April 1.
    const ones = screen.getAllByText("1");
    fireEvent.mouseDown(ones[1]); // April 1 overflow
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("navigates to the previous month", () => {
    render(<DatePicker onSelect={onSelect} onClose={onClose} />);
    const [prevBtn] = screen.getAllByRole("button");
    fireEvent.mouseDown(prevBtn);
    expect(screen.getByText("February 2026")).toBeInTheDocument();
  });

  it("navigates to the next month", () => {
    render(<DatePicker onSelect={onSelect} onClose={onClose} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.mouseDown(buttons[1]); // second button = next
    expect(screen.getByText("April 2026")).toBeInTheDocument();
  });

  it("wraps from January to December of the previous year", () => {
    vi.setSystemTime(new Date(2026, 0, 10)); // January 2026
    render(<DatePicker onSelect={onSelect} onClose={onClose} />);
    const [prevBtn] = screen.getAllByRole("button");
    fireEvent.mouseDown(prevBtn);
    expect(screen.getByText("December 2025")).toBeInTheDocument();
  });

  it("wraps from December to January of the next year", () => {
    vi.setSystemTime(new Date(2025, 11, 10)); // December 2025
    render(<DatePicker onSelect={onSelect} onClose={onClose} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.mouseDown(buttons[1]);
    expect(screen.getByText("January 2026")).toBeInTheDocument();
  });
});
