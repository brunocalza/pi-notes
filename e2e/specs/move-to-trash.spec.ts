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

/** Click the note card for a given note ID via its data-note-id attribute. */
async function clickNoteCard(noteId: number) {
  await browser.execute((id: number) => {
    const card = document.querySelector(`[data-note-id="${id}"]`) as HTMLElement | null;
    if (card) card.click();
  }, noteId);
}

describe("Move to Trash", () => {
  before(async () => {
    await browser.waitUntil(
      () => browser.execute(() => !!document.querySelector("nav span")),
      { timeout: 15_000, timeoutMsg: "Sidebar not loaded" }
    );
  });

  it("moves an inbox note to Trash via the actions popover", async () => {
    // Create a note via Tauri API (lands in Inbox); capture its ID
    const noteId = await browser.execute(async () => {
      const invoke = (window as any).__TAURI_INTERNALS__.invoke;
      return await invoke("insert_note", {
        title: "Note to trash",
        content: "some content",
        tags: [],
      });
    });

    // Navigate away and back to Inbox to trigger a UI refresh
    await clickNav("My Notes");
    await waitForText("My Notes");
    await clickNav("Inbox");
    await waitForText("Note to trash");

    // Click the specific note card by ID
    await clickNoteCard(noteId as number);
    await waitForText("Note actions");

    // Open the actions popover
    await browser.execute(() => {
      const btn = document.querySelector("button[title='Note actions']") as HTMLElement | null;
      if (btn) btn.click();
    });

    await waitForText("Move to trash");

    // Click "Move to trash"
    await browser.execute(() => {
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        if (btn.textContent?.trim() === "Move to trash") {
          btn.click();
          return;
        }
      }
    });

    // The note should disappear from Inbox
    await assertAbsent("Note to trash");

    // Navigate to Trash and verify the note is there
    await clickNav("Trash");
    await waitForText("Note to trash");
  });

  it("moves a note from My Notes to Trash via the actions popover", async () => {
    // Create a note and accept it so it appears in My Notes; capture its ID
    const noteId = await browser.execute(async () => {
      const invoke = (window as any).__TAURI_INTERNALS__.invoke;
      const id = await invoke("insert_note", {
        title: "My note to trash",
        content: "content",
        tags: [],
      });
      await invoke("accept_note", { id });
      return id;
    });

    // Navigate away and back to My Notes to trigger a UI refresh
    await clickNav("Inbox");
    await waitForText("Inbox");
    await clickNav("My Notes");
    await waitForText("My note to trash");

    // Click the specific note card by ID
    await clickNoteCard(noteId as number);
    await waitForText("Note actions");

    // Open the actions popover
    await browser.execute(() => {
      const btn = document.querySelector("button[title='Note actions']") as HTMLElement | null;
      if (btn) btn.click();
    });

    await waitForText("Move to trash");

    // Click "Move to trash"
    await browser.execute(() => {
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        if (btn.textContent?.trim() === "Move to trash") {
          btn.click();
          return;
        }
      }
    });

    // The note should disappear from My Notes
    await assertAbsent("My note to trash");

    // Navigate to Trash and verify the note is there
    await clickNav("Trash");
    await waitForText("My note to trash");
  });
});
