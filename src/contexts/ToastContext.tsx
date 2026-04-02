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
  const [exiting, setExiting] = useState(false);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 120);
  }, [toast.id, onDismiss]);

  useEffect(() => {
    const timer = setTimeout(dismiss, 4000);
    return () => clearTimeout(timer);
  }, [dismiss]);

  const isError = toast.type === "error";

  return (
    <div
      role="alert"
      onClick={dismiss}
      className={`flex items-start gap-2 px-3.5 py-2.5 rounded-lg text-[13px] leading-[1.4] cursor-pointer max-w-[360px] break-words border ${
        exiting ? "animate-toast-out" : "animate-toast-in"
      } ${isError ? "bg-danger text-danger bc-danger" : "bg-lift text-hi bc-ui"}`}
      style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.25)" }}
    >
      <span className="flex-1">{toast.message}</span>
      <span className="opacity-70 text-base leading-none shrink-0 mt-px" aria-hidden="true">
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
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2">
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
