// Shared helpers for e2e specs.
// These functions rely on the global `browser` provided by WebdriverIO.

/** Wait for the sidebar to render before running tests. */
export async function waitForApp() {
  await browser.waitUntil(
    () => browser.execute(() => !!document.querySelector("nav span")),
    { timeout: 15_000, timeoutMsg: "Sidebar not loaded" }
  );
}

/** Click a sidebar nav item by its label text. */
export async function clickNav(label: string) {
  await browser.execute((lbl: string) => {
    const navItems = document.querySelectorAll("nav div");
    for (const item of navItems) {
      const span = item.querySelector("span");
      if (span && span.textContent?.trim() === lbl) {
        (item as HTMLElement).click();
        return;
      }
    }
  }, label);
}

/** Wait for text to appear anywhere in the page body. */
export async function waitForText(text: string, timeout = 8_000) {
  await browser.waitUntil(
    () => browser.execute((t: string) => document.body.innerHTML.includes(t), text),
    { timeout, timeoutMsg: `"${text}" not found in DOM after ${timeout}ms` }
  );
}

/** Assert text is absent from the page body. */
export async function assertAbsent(text: string, timeout = 5_000) {
  await browser.waitUntil(
    () => browser.execute((t: string) => !document.body.innerHTML.includes(t), text),
    { timeout, timeoutMsg: `"${text}" still present in DOM after ${timeout}ms` }
  );
}

/** Click a button by its exact text label. */
export async function clickButton(label: string) {
  await browser.execute((lbl: string) => {
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      if (btn.textContent?.trim() === lbl) {
        btn.click();
        return;
      }
    }
  }, label);
}

/** Click the note card for a given note ID via its data-note-id attribute. */
export async function clickNoteCard(noteId: number) {
  await browser.execute((id: number) => {
    const card = document.querySelector(`[data-note-id="${id}"]`) as HTMLElement | null;
    if (card) card.click();
  }, noteId);
}

/** Open the note actions popover and wait for it to appear. */
export async function openActionsPopover() {
  await browser.execute(() => {
    const btn = document.querySelector("button[title='Note actions']") as HTMLElement | null;
    if (btn) btn.click();
  });
}

/** Invoke a Tauri command from within the browser context. */
export async function invoke<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  return browser.execute(
    async (cmd: string, a: Record<string, unknown>) => {
      const inv = (window as any).__TAURI_INTERNALS__.invoke;
      return await inv(cmd, a);
    },
    command,
    args
  ) as Promise<T>;
}
