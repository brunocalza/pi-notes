import { waitForApp, clickNav, waitForText, assertAbsent, invoke } from "../helpers.js";

describe("Empty Trash", () => {
  before(waitForApp);

  it("shows the Empty Trash button only when trash contains notes", async () => {
    await clickNav("Trash");
    await assertAbsent("Empty Trash");
  });

  it("permanently deletes all trashed notes when Empty Trash is clicked", async () => {
    // Create and trash a note directly via Tauri API
    const id = await invoke<number>("insert_note", { title: "Note to be trashed", content: "", tags: [] });
    await invoke("trash_note", { id });

    // Navigate away and back to Trash to trigger a UI refresh
    await clickNav("Inbox");
    await clickNav("Trash");

    await waitForText("Note to be trashed");
    await waitForText("Empty Trash");

    // Click Empty Trash — accept the confirmation dialog
    await browser.execute(() => {
      window.confirm = () => true;
      const buttons = document.querySelectorAll("button");
      for (const btn of buttons) {
        if (btn.textContent?.includes("Empty Trash")) {
          btn.click();
          return;
        }
      }
    });

    await waitForText("No notes here");
    await assertAbsent("Empty Trash");
  });
});
