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

    // Clear the title input and set a new value
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

    await browser.execute(() => {
      const inputs = document.querySelectorAll("input");
      for (const input of inputs) {
        if (input.placeholder === "Untitled" || input.value === "") {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
          if (setter) setter.call(input, "My new note");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }
      }
    });

    await waitForText("My new note");
  });
});
