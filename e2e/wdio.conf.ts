import type { Capabilities } from "@wdio/types";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const __dir = dirname(fileURLToPath(import.meta.url));

// Path to the compiled Tauri binary (run `npm run build` first)
const application = resolve(__dir, "../src-tauri/target/release/pi-notes");

let tauriDriver: ReturnType<typeof spawn>;
let tmpDir: string;

export const config = {
  specs: ["./specs/**/*.spec.ts"],
  exclude: [],
  maxInstances: 1,

  capabilities: [
    {
      maxInstances: 1,
      // tauri-driver capabilities — see https://tauri.app/develop/tests/webdriver/
      "tauri:options": {
        application,
      },
    } as Capabilities.RequestedStandaloneCapabilities,
  ],

  logLevel: "warn",
  bail: 0,
  waitforTimeout: 10_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,

  // tauri-driver must be installed separately:
  //   cargo install tauri-driver
  // It wraps the platform's native WebDriver (WebKitWebDriver on Linux,
  // SafariDriver on macOS, Edge WebDriver on Windows).
  hostname: "localhost",
  port: 4444,
  path: "/",

  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 30_000,
  },

  onPrepare: async () => {
    // Create a temporary directory and point the app at an isolated database.
    // The app reads PI_NOTES_DB_PATH at startup; tauri-driver inherits this env.
    tmpDir = mkdtempSync(resolve(tmpdir(), "pi-notes-e2e-"));
    process.env.PI_NOTES_DB_PATH = resolve(tmpDir, "test.db");

    tauriDriver = spawn("tauri-driver", [], {
      stdio: [null, process.stdout, process.stderr],
    });

    // Give tauri-driver a moment to start listening
    await new Promise((r) => setTimeout(r, 1000));
  },

  onComplete: () => {
    tauriDriver?.kill();

    // Remove the temporary database directory
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }

    delete process.env.PI_NOTES_DB_PATH;
  },
};
