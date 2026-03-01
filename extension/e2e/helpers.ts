import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import { chromium, type BrowserContext, type FrameLocator } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, "../.output/chrome-mv3");

export interface ExtensionContext {
  context: BrowserContext;
  extensionId: string;
}

/**
 * Launch Chromium with the built extension loaded.
 */
export async function launchExtension(): Promise<ExtensionContext> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "wikistat-e2e-"));

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--headless=new",
      "--no-first-run",
      "--disable-search-engine-choice-screen",
    ],
  });

  const serviceWorker =
    context.serviceWorkers().length > 0
      ? context.serviceWorkers()[0]
      : await context.waitForEvent("serviceworker");

  const extensionId = serviceWorker.url().split("/")[2];

  return { context, extensionId };
}

/**
 * Get the WikiStat panel iframe inside a Wikipedia page.
 * The content script injects an iframe with the panel app.
 */
export function getPanel(page: import("@playwright/test").Page, extensionId: string): FrameLocator {
  return page.frameLocator(`iframe[src^="chrome-extension://${extensionId}/panel.html"]`);
}
