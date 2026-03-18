// Prerequisites: app is built (`npm run build`) and tauri-driver is installed
// (`cargo install tauri-driver`). Run with: npm run test:e2e

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

describe("Create Note", () => {
  before(async () => {
    await browser.waitUntil(
      () => browser.execute(() => !!document.querySelector("nav span")),
      { timeout: 15_000, timeoutMsg: "Sidebar not loaded" }
    );
  });

  it("clicking New creates a note, switches to Inbox, and opens it in NoteDetail", async () => {
    // App starts in My Notes with no notes — confirm empty state
    await waitForText("No notes here");
    await assertAbsent("Note actions");

    // Click the New button
    await browser.execute(() => {
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        if (btn.textContent?.trim() === "New") {
          btn.click();
          return;
        }
      }
    });

    // The feed should switch to Inbox and show the new note card
    await waitForText("Inbox");
    await waitForText("New note");

    // NoteDetail should open automatically with the note selected
    await waitForText("Note actions");
  });

  it("the new note title can be edited", async () => {
    // Click New again
    await browser.execute(() => {
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        if (btn.textContent?.trim() === "New") {
          btn.click();
          return;
        }
      }
    });

    await waitForText("Note actions");

    // Clear the title input and type a new title
    await browser.execute(() => {
      const inputs = document.querySelectorAll("input");
      for (const input of inputs) {
        if (input.value === "New note") {
          input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
      }
    });

    // Type the new title character by character via input events
    await browser.execute(() => {
      const inputs = document.querySelectorAll("input");
      for (const input of inputs) {
        if ((input as HTMLInputElement).placeholder === "Untitled" || (input as HTMLInputElement).value === "") {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          if (nativeInputValueSetter) nativeInputValueSetter.call(input, "My new note");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
      }
    });

    await waitForText("My new note");
  });
});
