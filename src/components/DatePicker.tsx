import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  onSelect: (date: string) => void;
  onClose: () => void;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
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

export default function DatePicker({ onSelect, onClose }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells: Array<{ day: number; currentMonth: boolean }> = [];
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  for (let i = firstDayOfMonth - 1; i >= 0; i--) {
    cells.push({ day: prevMonthDays - i, currentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, currentMonth: true });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: cells.length - daysInMonth - firstDayOfMonth + 1, currentMonth: false });
  }

  const handleSelect = (day: number) => {
    const mm = String(viewMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    onSelect(`${viewYear}-${mm}-${dd}`);
    onClose();
  };

  const isToday = (day: number) =>
    day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  return (
    <div className="bg-field border bc-ui rounded-md shadow-xl z-50 p-3 w-56">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button
          aria-label="Previous month"
          onMouseDown={(e) => {
            e.preventDefault();
            prevMonth();
          }}
          className="p-0.5 rounded hover:bg-lift text-ghost hover:text-lo transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-semibold text-md">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button
          aria-label="Next month"
          onMouseDown={(e) => {
            e.preventDefault();
            nextMonth();
          }}
          className="p-0.5 rounded hover:bg-lift text-ghost hover:text-lo transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-center text-[10px] text-ghost font-medium py-0.5">
            {wd}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => (
          <button
            key={idx}
            onMouseDown={(e) => {
              e.preventDefault();
              if (cell.currentMonth) handleSelect(cell.day);
            }}
            className={`text-center text-xs py-1 rounded transition-colors ${
              !cell.currentMonth
                ? "text-ghost cursor-default"
                : isToday(cell.day)
                  ? "bg-accent-btn text-accent font-semibold hover:bg-accent-btn-hover cursor-pointer"
                  : "text-md hover:bg-lift cursor-pointer"
            }`}
          >
            {cell.day}
          </button>
        ))}
      </div>
    </div>
  );
}
