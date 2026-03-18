import {
  waitForApp,
  clickNav,
  waitForText,
  assertAbsent,
  clickNoteCard,
  clickButton,
  openActionsPopover,
  invoke,
} from "../helpers.js";

describe("Move to Trash", () => {
  before(waitForApp);

  it("moves an inbox note to Trash via the actions popover", async () => {
    const noteId = await invoke<number>("insert_note", {
      title: "Note to trash",
      content: "some content",
      tags: [],
    });

    // Navigate away and back to Inbox to trigger a UI refresh
    await clickNav("My Notes");
    await waitForText("My Notes");
    await clickNav("Inbox");
    await waitForText("Note to trash");

    await clickNoteCard(noteId);
    await waitForText("Note actions");

    await openActionsPopover();
    await waitForText("Move to trash");
    await clickButton("Move to trash");

    await assertAbsent("Note to trash");

    await clickNav("Trash");
    await waitForText("Note to trash");
  });

  it("moves a note from My Notes to Trash via the actions popover", async () => {
    const id = await invoke<number>("insert_note", {
      title: "My note to trash",
      content: "content",
      tags: [],
    });
    await invoke("accept_note", { id });

    // Navigate away and back to My Notes to trigger a UI refresh
    await clickNav("Inbox");
    await waitForText("Inbox");
    await clickNav("My Notes");
    await waitForText("My note to trash");

    await clickNoteCard(id);
    await waitForText("Note actions");

    await openActionsPopover();
    await waitForText("Move to trash");
    await clickButton("Move to trash");

    await assertAbsent("My note to trash");

    await clickNav("Trash");
    await waitForText("My note to trash");
  });
});
