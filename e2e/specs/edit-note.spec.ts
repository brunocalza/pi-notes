import { waitForApp, clickNav, waitForText, clickNoteCard, invoke } from "../helpers.js";

describe("Edit Note", () => {
  before(waitForApp);

  it("edits the title and content of an existing note", async () => {
    const noteId = await invoke<string>("insert_note", {
      title: "Original Title",
      content: "Original content",
      tags: [],
    });

    // Navigate away and back to refresh the feed
    await clickNav("My Notes");
    await waitForText("My Notes");
    await clickNav("Inbox");
    await waitForText("Original Title");

    await clickNoteCard(noteId);

    // Wait for the title textarea to appear and edit it
    await browser.waitUntil(
      () =>
        browser.execute(
          () => !!document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Untitled"]')
        ),
      { timeout: 5_000, timeoutMsg: "Title textarea not found" }
    );

    // Clear and type new title
    await browser.execute(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>(
        'textarea[placeholder="Untitled"]'
      );
      if (!textarea) return;
      // Focus, select all, replace
      textarea.focus();
      textarea.select();
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      nativeInputValueSetter?.call(textarea, "Edited Title");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
      textarea.blur();
    });

    // Wait for the title to update in the feed
    await waitForText("Edited Title");

    // Now edit the content via the Milkdown editor
    await browser.execute(() => {
      const editor = document.querySelector<HTMLElement>(".milkdown-editor .ProseMirror");
      if (!editor) return;
      editor.focus();
      // Select all and replace content
      document.execCommand("selectAll");
      document.execCommand("insertText", false, "Edited content paragraph");
    });

    // Wait briefly for the debounced commit
    await browser.pause(500);

    // Navigate away to My Notes and verify the note persisted
    await clickNav("My Notes");
    await waitForText("My Notes");

    // Accept the note first so it appears in My Notes
    await clickNav("Inbox");
    await waitForText("Edited Title");
    await clickNoteCard(noteId);

    // Verify the edited content is displayed
    await waitForText("Edited content paragraph");

    // Verify the edited title is displayed
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const textarea = document.querySelector<HTMLTextAreaElement>(
            'textarea[placeholder="Untitled"]'
          );
          return textarea?.value === "Edited Title";
        }),
      { timeout: 5_000, timeoutMsg: "Title textarea does not have the edited title" }
    );
  });
});
