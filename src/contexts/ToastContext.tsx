import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import ReactDOM from "react-dom";

type ToastType = "error" | "success";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToastContext(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToastContext must be used within ToastProvider");
  return ctx;
}

let nextId = 0;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const isError = toast.type === "error";
  const style: React.CSSProperties = isError
    ? {
        background: "var(--c-danger-bg)",
        color: "var(--c-danger-text)",
        border: "1px solid var(--c-danger-text)",
      }
    : {
        background: "var(--c-bg-lift)",
        color: "var(--c-text-hi)",
        border: "1px solid var(--c-bc-ui)",
      };

  return (
    <div
      onClick={() => onDismiss(toast.id)}
      style={{
        ...style,
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "10px 14px",
        borderRadius: 8,
        fontSize: 13,
        lineHeight: "1.4",
        cursor: "pointer",
        maxWidth: 360,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        wordBreak: "break-word",
      }}
    >
      <span style={{ flex: 1 }}>{toast.message}</span>
      <span
        style={{
          opacity: 0.7,
          fontSize: 16,
          lineHeight: 1,
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        ×
      </span>
    </div>
  );
}

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return ReactDOM.createPortal(
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
