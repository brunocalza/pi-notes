import "@testing-library/jest-dom";

// Mock IntersectionObserver which is not available in jsdom
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class IntersectionObserver {
    constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    root: Element | Document | null = null;
    rootMargin = "0px";
    thresholds: ReadonlyArray<number> = [];
  };
}
