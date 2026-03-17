// Prerequisites: app is built (`npm run build`) and tauri-driver is installed
// (`cargo install tauri-driver`). Run with: npm run test:e2e

/** Click a sidebar nav item by its label text */
async function clickNav(label: string) {
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

/** Wait for text to appear anywhere in the page body */
async function waitForText(text: string, timeout = 8_000) {
  await browser.waitUntil(
    () => browser.execute((t: string) => document.body.innerHTML.includes(t), text),
    { timeout, timeoutMsg: `"${text}" not found in DOM after ${timeout}ms` }
  );
}

/** Assert text is absent from the page body */
async function assertAbsent(text: string, timeout = 5_000) {
  await browser.waitUntil(
    () => browser.execute((t: string) => !document.body.innerHTML.includes(t), text),
    { timeout, timeoutMsg: `"${text}" still present in DOM after ${timeout}ms` }
  );
}

describe("Empty Trash", () => {
  before(async () => {
    // Wait for the sidebar to fully render
    await browser.waitUntil(
      () => browser.execute(() => !!document.querySelector("nav span")),
      { timeout: 15_000, timeoutMsg: "Sidebar not loaded" }
    );
  });

  it("shows the Empty Trash button only when trash contains notes", async () => {
    await clickNav("Trash");
    await assertAbsent("Empty Trash");
  });

  it("permanently deletes all trashed notes when Empty Trash is clicked", async () => {
    // Create and trash a note directly via Tauri API
    await browser.execute(async () => {
      const invoke = (window as any).__TAURI_INTERNALS__.invoke;
      const id = await invoke("insert_note", { title: "Note to be trashed", content: "", tags: [] });
      await invoke("trash_note", { id });
    });

    // Navigate away and back to Trash to trigger a UI refresh
    await clickNav("Inbox");
    await clickNav("Trash");

    // The trashed note should appear and the Empty Trash button should be visible
    await waitForText("Note to be trashed");
    await waitForText("Empty Trash");

    // Click Empty Trash — accept the confirmation dialog
    await browser.execute(() => {
      // Pre-accept the confirm dialog
      window.confirm = () => true;
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        if (btn.textContent?.includes("Empty Trash")) {
          btn.click();
          return;
        }
      }
    });

    // The note list should now be empty and the button gone
    await waitForText("No notes here");
    await assertAbsent("Empty Trash");
  });
});
