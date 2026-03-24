import { useCallback } from "react";
import { useToastContext } from "../contexts/ToastContext";

export function useToast() {
  const { showToast } = useToastContext();
  const error = useCallback((message: string) => showToast("error", message), [showToast]);
  const success = useCallback((message: string) => showToast("success", message), [showToast]);
  return { error, success };
}
