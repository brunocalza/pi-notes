import { render, screen, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, afterEach } from "vitest";
import { ToastProvider, useToastContext } from "./ToastContext";
import { useToast } from "../hooks/useToast";

function Triggers() {
  const { showToast } = useToastContext();
  return (
    <>
      <button onClick={() => showToast("error", "Error message")}>Show Error</button>
      <button onClick={() => showToast("success", "Success message")}>Show Success</button>
    </>
  );
}

function HookTriggers() {
  const { error, success } = useToast();
  return (
    <>
      <button onClick={() => error("Hook error")}>Hook Error</button>
      <button onClick={() => success("Hook success")}>Hook Success</button>
    </>
  );
}

describe("ToastProvider", () => {
  afterEach(() => vi.useRealTimers());

  it("renders children", () => {
    render(
      <ToastProvider>
        <span>child</span>
      </ToastProvider>
    );
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("shows an error toast when showToast('error') is called", async () => {
    render(
      <ToastProvider>
        <Triggers />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText("Show Error"));
    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("shows a success toast when showToast('success') is called", async () => {
    render(
      <ToastProvider>
        <Triggers />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText("Show Success"));
    expect(screen.getByText("Success message")).toBeInTheDocument();
  });

  it("dismisses toast when clicked", async () => {
    render(
      <ToastProvider>
        <Triggers />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText("Show Error"));
    expect(screen.getByText("Error message")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Error message"));
    expect(screen.queryByText("Error message")).not.toBeInTheDocument();
  });

  it("auto-dismisses toast after 4 seconds", async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Triggers />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Show Error"));
    expect(screen.getByText("Error message")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(4100);
    });
    expect(screen.queryByText("Error message")).not.toBeInTheDocument();
  });

  it("shows multiple toasts simultaneously", async () => {
    render(
      <ToastProvider>
        <Triggers />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText("Show Error"));
    await userEvent.click(screen.getByText("Show Success"));
    expect(screen.getByText("Error message")).toBeInTheDocument();
    expect(screen.getByText("Success message")).toBeInTheDocument();
  });

  it("can dismiss one toast independently", async () => {
    render(
      <ToastProvider>
        <Triggers />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText("Show Error"));
    await userEvent.click(screen.getByText("Show Success"));
    await userEvent.click(screen.getByText("Error message"));
    expect(screen.queryByText("Error message")).not.toBeInTheDocument();
    expect(screen.getByText("Success message")).toBeInTheDocument();
  });
});

describe("useToastContext error handling", () => {
  it("throws when used outside ToastProvider", () => {
    function BadComponent() {
      useToastContext();
      return null;
    }
    // Suppress the error boundary output to keep test output clean
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<BadComponent />)).toThrow(
      "useToastContext must be used within ToastProvider"
    );
    consoleSpy.mockRestore();
  });
});

describe("useToast hook", () => {
  it("error() shows an error toast", async () => {
    render(
      <ToastProvider>
        <HookTriggers />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText("Hook Error"));
    expect(screen.getByText("Hook error")).toBeInTheDocument();
  });

  it("success() shows a success toast", async () => {
    render(
      <ToastProvider>
        <HookTriggers />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText("Hook Success"));
    expect(screen.getByText("Hook success")).toBeInTheDocument();
  });
});
