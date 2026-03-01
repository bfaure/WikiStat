import { test, expect, type BrowserContext } from "@playwright/test";
import { launchExtension, getPanel } from "./helpers";

let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  ({ context, extensionId } = await launchExtension());
});

test.afterAll(async () => {
  await context.close();
});

test("content script writes currentArticle to session storage", async () => {
  const page = await context.newPage();
  await page.goto("https://en.wikipedia.org/wiki/Albert_Einstein", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  const sw = context.serviceWorkers()[0];
  const stored = await sw.evaluate(() =>
    chrome.storage.session.get("currentArticle")
  );

  expect(stored.currentArticle).toMatchObject({
    lang: "en",
    slug: "Albert_Einstein",
  });
  expect(stored.currentArticle.title).toContain("Albert Einstein");

  await page.close();
});

test("injected panel shows article info on Wikipedia page", async () => {
  const page = await context.newPage();
  await page.goto("https://en.wikipedia.org/wiki/Albert_Einstein", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  // The panel iframe should be injected into the page
  const panel = getPanel(page, extensionId);

  await expect(panel.locator(".lang-badge")).toContainText(
    "EN",
    { timeout: 10_000 }
  );

  // Should not be in empty state
  await expect(panel.locator(".empty-state")).not.toBeVisible();

  await page.close();
});

test("panel updates when navigating to a different article", async () => {
  const page = await context.newPage();
  await page.goto("https://en.wikipedia.org/wiki/Albert_Einstein", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  const panel = getPanel(page, extensionId);
  await expect(panel.locator(".lang-badge")).toContainText(
    "EN",
    { timeout: 10_000 }
  );

  // Navigate the same tab to a different article
  await page.goto("https://en.wikipedia.org/wiki/Physics", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  // New page load = new content script = new panel iframe
  const panel2 = getPanel(page, extensionId);
  await expect(panel2.locator(".lang-badge")).toContainText("EN", {
    timeout: 10_000,
  });

  await page.close();
});

test("detects articles on non-English Wikipedia", async () => {
  const page = await context.newPage();
  await page.goto("https://de.wikipedia.org/wiki/Albert_Einstein", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  const sw = context.serviceWorkers()[0];
  const stored = await sw.evaluate(() =>
    chrome.storage.session.get("currentArticle")
  );

  expect(stored.currentArticle).toMatchObject({
    lang: "de",
    slug: "Albert_Einstein",
  });

  await page.close();
});

test("panel shows loading skeletons then stats", async () => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.session.remove("currentArticle"));

  const page = await context.newPage();
  await page.goto("https://en.wikipedia.org/wiki/Albert_Einstein", {
    waitUntil: "domcontentloaded",
  });

  const panel = getPanel(page, extensionId);

  // Lang badge should appear quickly (panel has loaded)
  await expect(panel.locator(".lang-badge")).toContainText(
    "EN",
    { timeout: 10_000 }
  );

  // Eventually stats should load
  await expect(panel.locator(".stat-value").first()).toBeVisible({
    timeout: 15_000,
  });

  await page.close();
});

test("panel shows lang badge for the article", async () => {
  const page = await context.newPage();
  await page.goto("https://en.wikipedia.org/wiki/Albert_Einstein", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  const panel = getPanel(page, extensionId);
  await expect(panel.locator(".lang-badge")).toContainText(
    "EN",
    { timeout: 10_000 }
  );

  // Talk link should be present
  const talkLink = panel.locator(".talk-link");
  await expect(talkLink).toBeVisible({ timeout: 5_000 });
  const href = await talkLink.getAttribute("href");
  expect(href).toContain("en.wikipedia.org/wiki/Talk:Albert_Einstein");

  await page.close();
});

test("Main_Page is skipped by content script", async () => {
  const sw = context.serviceWorkers()[0];
  await sw.evaluate(() => chrome.storage.session.remove("currentArticle"));

  const page = await context.newPage();
  await page.goto("https://en.wikipedia.org/wiki/Main_Page", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  const stored = await sw.evaluate(() =>
    chrome.storage.session.get("currentArticle")
  );
  expect(stored.currentArticle).toBeUndefined();

  // Panel should NOT be injected on Main_Page
  await expect(page.locator("#wikistat-panel-container")).not.toBeAttached();

  await page.close();
});

test("non-article page has no panel injected", async () => {
  const page = await context.newPage();
  await page.goto("https://en.wikipedia.org/wiki/Wikipedia:About", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  // Panel should NOT be injected on non-article namespace pages
  await expect(page.locator("#wikistat-panel-container")).not.toBeAttached();

  await page.close();
});

test("panel shows views trend indicator", async () => {
  const page = await context.newPage();
  await page.goto("https://en.wikipedia.org/wiki/Albert_Einstein", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  const panel = getPanel(page, extensionId);

  // Wait for stats to load
  await expect(panel.locator(".stat-value").first()).toBeVisible({
    timeout: 15_000,
  });

  // Trend indicator for popular articles with 60+ days data
  const trend = panel.locator(".stat-trend");
  await expect(trend).toBeVisible({ timeout: 5_000 });
  const trendText = await trend.textContent();
  expect(trendText).toMatch(/[▲▼]\s*\d+%/);

  await page.close();
});

test("panel shows article creation date", async () => {
  const page = await context.newPage();
  await page.goto("https://en.wikipedia.org/wiki/Albert_Einstein", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  const panel = getPanel(page, extensionId);

  await expect(panel.locator(".stat-value").first()).toBeVisible({
    timeout: 15_000,
  });

  const createdLabel = panel.locator(".stat-label", { hasText: "Created" });
  await expect(createdLabel).toBeVisible({ timeout: 5_000 });

  await page.close();
});

test("toggle button shows and hides panel", async () => {
  const page = await context.newPage();
  await page.goto("https://en.wikipedia.org/wiki/Albert_Einstein", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  // Toggle button should be visible
  const toggleBtn = page.locator("#wikistat-toggle");
  await expect(toggleBtn).toBeVisible({ timeout: 5_000 });

  // Panel container should exist
  const container = page.locator("#wikistat-panel-container");
  await expect(container).toBeAttached();

  // Click toggle to close
  await toggleBtn.click();
  await page.waitForTimeout(500);

  // Toggle text should be "W" when closed
  await expect(toggleBtn).toContainText("W");

  // Click toggle to open again
  await toggleBtn.click();
  await page.waitForTimeout(500);

  // Toggle text should be the close icon when open
  const text = await toggleBtn.textContent();
  expect(text).toBe("\u2715");

  await page.close();
});

test("panel shows reading time", async () => {
  const page = await context.newPage();
  await page.goto("https://en.wikipedia.org/wiki/Albert_Einstein", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  const panel = getPanel(page, extensionId);

  await expect(panel.locator(".stat-value").first()).toBeVisible({
    timeout: 15_000,
  });

  const readingLabel = panel.locator(".stat-label", { hasText: "Reading time" });
  await expect(readingLabel).toBeVisible({ timeout: 10_000 });

  await page.close();
});

test("keyboard shortcut Alt+W toggles panel", async () => {
  const page = await context.newPage();
  await page.goto("https://en.wikipedia.org/wiki/Albert_Einstein", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  const toggleBtn = page.locator("#wikistat-toggle");
  await expect(toggleBtn).toBeVisible({ timeout: 5_000 });

  // Panel should start open (close icon)
  const textBefore = await toggleBtn.textContent();
  expect(textBefore).toBe("\u2715");

  // Press Alt+W to close
  await page.keyboard.press("Alt+w");
  await page.waitForTimeout(500);
  await expect(toggleBtn).toContainText("W");

  // Press Alt+W to open again
  await page.keyboard.press("Alt+w");
  await page.waitForTimeout(500);
  const textAfter = await toggleBtn.textContent();
  expect(textAfter).toBe("\u2715");

  await page.close();
});

test("panel pushes page content when open", async () => {
  const page = await context.newPage();
  await page.goto("https://en.wikipedia.org/wiki/Albert_Einstein", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  // Panel should auto-open — body should have margin-right
  const marginRight = await page.evaluate(() =>
    parseInt(document.body.style.marginRight || "0", 10)
  );
  expect(marginRight).toBeGreaterThan(0);

  // Close the panel
  const toggleBtn = page.locator("#wikistat-toggle");
  await toggleBtn.click();
  await page.waitForTimeout(500);

  // Body margin should be restored
  const marginAfterClose = await page.evaluate(() =>
    parseInt(document.body.style.marginRight || "0", 10)
  );
  expect(marginAfterClose).toBe(0);

  await page.close();
});

test("resize handle is present on panel", async () => {
  const page = await context.newPage();
  await page.goto("https://en.wikipedia.org/wiki/Albert_Einstein", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  const resizeHandle = page.locator("#wikistat-resize-handle");
  await expect(resizeHandle).toBeAttached();

  const cursor = await resizeHandle.evaluate((el) =>
    (el as HTMLElement).style.cursor
  );
  expect(cursor).toBe("col-resize");

  await page.close();
});

test("back/forward navigation updates panel", async () => {
  const page = await context.newPage();

  await page.goto("https://en.wikipedia.org/wiki/Albert_Einstein", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  let panel = getPanel(page, extensionId);
  await expect(panel.locator(".lang-badge")).toContainText(
    "EN",
    { timeout: 10_000 }
  );

  await page.goto("https://en.wikipedia.org/wiki/Physics", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2000);

  panel = getPanel(page, extensionId);
  await expect(panel.locator(".lang-badge")).toContainText("EN", {
    timeout: 10_000,
  });

  // Go back
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  panel = getPanel(page, extensionId);
  await expect(panel.locator(".lang-badge")).toContainText(
    "EN",
    { timeout: 10_000 }
  );

  await page.close();
});
