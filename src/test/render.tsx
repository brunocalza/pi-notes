import { render as rtlRender, RenderOptions } from "@testing-library/react";
import { ReactElement } from "react";
import { ToastProvider } from "../contexts/ToastContext";

export function render(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return rtlRender(ui, { wrapper: ToastProvider, ...options });
}

export * from "@testing-library/react";
