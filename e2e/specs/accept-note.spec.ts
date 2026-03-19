import {
  waitForApp,
  clickNav,
  waitForText,
  clickNoteCard,
  clickButton,
  openActionsPopover,
  invoke,
} from "../helpers.js";

describe("Accept Note", () => {
  before(waitForApp);

  it("Accept note is disabled when note has no title or content", async () => {
    const noteId = await invoke<number>("insert_note", { title: "", content: "", tags: [] });

    await clickNav("My Notes");
    await waitForText("My Notes");
    await clickNav("Inbox");

    await clickNoteCard(noteId);
    await waitForText("Note actions");

    await openActionsPopover();
    await waitForText("Accept note");

    const isDisabled = await browser.execute(() => {
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        if (btn.textContent?.trim() === "Accept note") return btn.hasAttribute("disabled");
      }
      return false;
    });

    if (!isDisabled) throw new Error("Expected Accept note button to be disabled");
  });

  it("accepts a note that has a title and content — moves it to My Notes", async () => {
    const noteId = await invoke<number>("insert_note", {
      title: "Note to accept",
      content: "Has some content",
      tags: [],
    });

    // Navigate away and back to Inbox to trigger a UI refresh
    await clickNav("My Notes");
    await waitForText("My Notes");
    await clickNav("Inbox");
    await waitForText("Note to accept");

    await clickNoteCard(noteId);
    await waitForText("Note actions");

    await openActionsPopover();
    await waitForText("Accept note");
    await clickButton("Accept note");

    // Note disappears from the Inbox feed (may still appear in sidebar Recent)
    await browser.waitUntil(
      () =>
        browser.execute((title: string) => {
          const feed = document.querySelector<HTMLElement>('[style*="360"]');
          return feed ? !feed.innerHTML.includes(title) : false;
        }, "Note to accept"),
      { timeout: 5_000, timeoutMsg: '"Note to accept" still present in Inbox feed after 5000ms' }
    );

    await clickNav("My Notes");
    await waitForText("Note to accept");
  });
});
