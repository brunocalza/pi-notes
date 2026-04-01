import { waitForApp, waitForText, clickButton } from "../helpers.js";

describe("Create Note", () => {
  before(waitForApp);

  it("clicking New creates a note, switches to Inbox, and opens it in NoteDetail", async () => {
    await clickButton("New");

    await waitForText("Inbox");
    await waitForText("New note");
    await waitForText("Note actions");
  });

  it("the new note title can be edited", async () => {
    await clickButton("New");
    await waitForText("Note actions");

    // Wait for the title textarea to be present and have the default value
    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const textareas = document.querySelectorAll("textarea");
          return Array.from(textareas).some((ta) => ta.value === "New note");
        }),
      { timeout: 8_000, timeoutMsg: "Title textarea with 'New note' not found" }
    );

    // Clear the title textarea and set a new value
    await browser.execute(() => {
      const textareas = document.querySelectorAll("textarea");
      for (const ta of textareas) {
        if (ta.value === "New note") {
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            "value"
          )?.set;
          if (setter) setter.call(ta, "My new note");
          ta.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
      }
    });

    await waitForText("My new note");
  });
});
