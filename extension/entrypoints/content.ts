import type { ArticleInfo, ExtensionMessage } from "../lib/types";
import { ContentScriptContext } from "wxt/utils/content-script-context";

// Shared list of non-article namespace prefixes
const NON_ARTICLE_PREFIXES = [
  "Special:", "Talk:", "User:", "User_talk:",
  "Wikipedia:", "Wikipedia_talk:", "File:", "File_talk:",
  "MediaWiki:", "MediaWiki_talk:", "Template:", "Template_talk:",
  "Help:", "Help_talk:", "Category:", "Category_talk:",
  "Portal:", "Portal_talk:", "Draft:", "Draft_talk:",
  "Module:", "Module_talk:", "TimedText:", "Book:",
];

function isNonArticle(slug: string): boolean {
  return slug === "Main_Page" || NON_ARTICLE_PREFIXES.some((ns) => slug.startsWith(ns));
}

export default defineContentScript({
  matches: ["*://*.wikipedia.org/wiki/*"],
  runAt: "document_idle",

  main(ctx: ContentScriptContext) {
    let currentArticle: ArticleInfo | null = null;
    // Set by injectPanel so handleArticle can postMessage the iframe directly
    let notifyPanel: ((article: ArticleInfo) => void) | null = null;

    // ── Article detection ───────────────────────────────────────────────
    /**
     * Detect article and update session storage + notify panel iframe.
     * @param force — skip duplicate check (needed for back/forward/bfcache)
     */
    function handleArticle(force = false) {
      if (ctx.isInvalid) return;

      const previous = currentArticle;
      const article = detectArticle();
      if (!article) return;

      if (
        !force &&
        previous &&
        previous.slug === article.slug &&
        previous.lang === article.lang
      ) {
        return;
      }

      currentArticle = article;

      // Write to session storage for initial panel load
      chrome.storage.session.set({ currentArticle: article }).catch(() => {});
      chrome.runtime.sendMessage({
        type: "ARTICLE_DETECTED",
        article,
      } satisfies ExtensionMessage).catch(() => {});

      // Notify this tab's panel directly — avoids cross-tab session storage bleed
      notifyPanel?.(article);
    }

    handleArticle();

    ctx.addEventListener(window, "wxt:locationchange", () => handleArticle());

    // Back/forward — force storage write since bfcache can restore stale state
    ctx.addEventListener(window, "popstate", () => {
      setTimeout(() => handleArticle(true), 150);
      // Retry in case DOM hasn't fully updated yet
      setTimeout(() => handleArticle(true), 600);
    });

    // bfcache restoration — always force re-sync
    ctx.addEventListener(window, "pageshow", ((e: PageTransitionEvent) => {
      if (e.persisted) {
        handleArticle(true);
      }
    }) as EventListener);

    // URL polling fallback for navigations that events miss
    let lastUrl = window.location.href;
    const urlPoller = setInterval(() => {
      if (ctx.isInvalid) { clearInterval(urlPoller); return; }
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        handleArticle();
      }
    }, 500);

    // ── Injected panel ──────────────────────────────────────────────────
    if (detectArticle()) {
      injectPanel(ctx, (notify) => { notifyPanel = notify; });
    }

    // ── Keyboard shortcut ────────────────────────────────────────────────
    ctx.addEventListener(document, "keydown", (e) => {
      // Alt+W toggles the panel
      if (e.altKey && e.key.toLowerCase() === "w" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const toggle = document.getElementById("wikistat-toggle");
        toggle?.click();
      }
    });
  },
});

// ── Panel injection ───────────────────────────────────────────────────────

function injectPanel(ctx: ContentScriptContext, onReady: (notify: (article: ArticleInfo) => void) => void) {
  const DEFAULT_WIDTH = 360;
  const MIN_WIDTH = 280;
  const MAX_WIDTH = 600;
  const panelUrl = chrome.runtime.getURL("/panel.html");

  let panelWidth = DEFAULT_WIDTH;

  // Detect dark mode — check Wikipedia's actual theme class first,
  // fall back to system preference only if Wikipedia uses "auto" (OS preference)
  const htmlEl = document.documentElement;

  function detectDarkMode(): boolean {
    const isWikiDark = htmlEl.classList.contains("skin-theme-clientpref-night");
    const isWikiAuto = htmlEl.classList.contains("skin-theme-clientpref-os");
    const isSystemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return isWikiDark || (isWikiAuto && isSystemDark);
  }

  let isDark = detectDarkMode();

  // Container — fixed position, right side
  const container = document.createElement("div");
  container.id = "wikistat-panel-container";
  Object.assign(container.style, {
    position: "fixed",
    top: "0",
    right: "0",
    width: `${panelWidth}px`,
    height: "100vh",
    zIndex: "999999",
    transform: "translateX(100%)",
    transition: "transform 0.25s ease, width 0s",
    borderLeft: isDark ? "1px solid #2e3338" : "1px solid #a2a9b1",
    boxShadow: isDark ? "-2px 0 8px rgba(0,0,0,0.4)" : "-2px 0 8px rgba(0,0,0,0.08)",
    display: "flex",
  });

  // Resize handle — left edge of panel
  const resizeHandle = document.createElement("div");
  resizeHandle.id = "wikistat-resize-handle";
  Object.assign(resizeHandle.style, {
    position: "absolute",
    top: "0",
    left: "0",
    width: "5px",
    height: "100%",
    cursor: "col-resize",
    zIndex: "1000000",
    background: "transparent",
  });
  // Visual indicator on hover
  resizeHandle.addEventListener("mouseenter", () => {
    resizeHandle.style.background = "rgba(51, 102, 204, 0.3)";
  });
  resizeHandle.addEventListener("mouseleave", () => {
    if (!isDragging) resizeHandle.style.background = "transparent";
  });
  container.appendChild(resizeHandle);

  // Iframe — loads the panel React app
  const iframe = document.createElement("iframe");
  iframe.src = `${panelUrl}?theme=${isDark ? "dark" : "light"}`;
  Object.assign(iframe.style, {
    width: "100%",
    height: "100%",
    border: "none",
    background: isDark ? "#101418" : "#ffffff",
    flex: "1",
  });
  container.appendChild(iframe);

  // Register direct postMessage notifier for this tab's panel
  onReady((article) => {
    iframe.contentWindow?.postMessage({ type: "WIKISTAT_ARTICLE_CHANGE", article }, "*");
  });

  // Toggle button — small tab on the right edge
  const toggle = document.createElement("button");
  toggle.id = "wikistat-toggle";
  toggle.title = "Toggle WikiStat panel (Alt+W)";
  toggle.textContent = "W";
  Object.assign(toggle.style, {
    position: "fixed",
    top: "50%",
    right: "0",
    transform: "translateY(-50%)",
    zIndex: "999998",
    width: "28px",
    height: "56px",
    background: "#3366cc",
    color: "white",
    border: "none",
    borderRadius: "6px 0 0 6px",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "700",
    fontFamily: "system-ui, sans-serif",
    boxShadow: "-2px 0 8px rgba(0,0,0,0.15)",
    transition: "right 0.25s ease, background 0.15s",
    padding: "0",
    lineHeight: "56px",
    textAlign: "center",
  });

  let isOpen = false;

  function setPanelWidth(w: number) {
    panelWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w));
    container.style.width = `${panelWidth}px`;
    if (isOpen) {
      toggle.style.right = `${panelWidth}px`;
      document.body.style.marginRight = `${panelWidth}px`;
    }
    chrome.storage.local.set({ wikistatPanelWidth: panelWidth }).catch(() => {});
  }

  function openPanel() {
    isOpen = true;
    container.style.transform = "translateX(0)";
    toggle.style.right = `${panelWidth}px`;
    toggle.textContent = "\u2715"; // ✕ close icon
    toggle.style.borderRadius = "6px 0 0 6px";
    // Push Wikipedia content to the left so panel doesn't overlay
    document.body.style.transition = "margin-right 0.25s ease";
    document.body.style.marginRight = `${panelWidth}px`;
    chrome.storage.local.set({ wikistatPanelOpen: true }).catch(() => {});
  }

  function closePanel() {
    isOpen = false;
    container.style.transform = "translateX(100%)";
    toggle.style.right = "0";
    toggle.textContent = "W";
    // Restore Wikipedia content width
    document.body.style.marginRight = "0";
    chrome.storage.local.set({ wikistatPanelOpen: false }).catch(() => {});
  }

  toggle.addEventListener("click", () => {
    if (isOpen) closePanel();
    else openPanel();
  });

  // ── Drag-to-resize ────────────────────────────────────────────────────
  let isDragging = false;

  resizeHandle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    isDragging = true;
    resizeHandle.style.background = "rgba(51, 102, 204, 0.3)";
    // Disable transition during drag for smooth resizing
    container.style.transition = "none";
    document.body.style.transition = "none";
    // Prevent iframe from capturing mouse events during drag
    iframe.style.pointerEvents = "none";

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging) return;
      const newWidth = window.innerWidth - ev.clientX;
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      isDragging = false;
      resizeHandle.style.background = "transparent";
      container.style.transition = "transform 0.25s ease, width 0s";
      document.body.style.transition = "margin-right 0.25s ease";
      iframe.style.pointerEvents = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  // Watch for Wikipedia theme changes (user toggles dark mode)
  const themeObserver = new MutationObserver(() => {
    const nowDark = detectDarkMode();
    if (nowDark === isDark) return;
    isDark = nowDark;

    // Update container styling
    container.style.borderLeft = isDark ? "1px solid #2e3338" : "1px solid #a2a9b1";
    container.style.boxShadow = isDark ? "-2px 0 8px rgba(0,0,0,0.4)" : "-2px 0 8px rgba(0,0,0,0.08)";
    iframe.style.background = isDark ? "#101418" : "#ffffff";

    // Notify the panel iframe
    iframe.contentWindow?.postMessage(
      { type: "WIKISTAT_THEME_CHANGE", theme: isDark ? "dark" : "light" },
      "*"
    );
  });
  themeObserver.observe(htmlEl, { attributes: true, attributeFilter: ["class"] });

  // Also watch system preference changes for "auto" mode
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const nowDark = detectDarkMode();
    if (nowDark === isDark) return;
    isDark = nowDark;
    container.style.borderLeft = isDark ? "1px solid #2e3338" : "1px solid #a2a9b1";
    container.style.boxShadow = isDark ? "-2px 0 8px rgba(0,0,0,0.4)" : "-2px 0 8px rgba(0,0,0,0.08)";
    iframe.style.background = isDark ? "#101418" : "#ffffff";
    iframe.contentWindow?.postMessage(
      { type: "WIKISTAT_THEME_CHANGE", theme: isDark ? "dark" : "light" },
      "*"
    );
  });

  document.body.appendChild(container);
  document.body.appendChild(toggle);

  // Restore previous width and open/closed state
  chrome.storage.local.get(["wikistatPanelWidth", "wikistatPanelOpen"], (localResult) => {
    // Restore saved width
    if (typeof localResult.wikistatPanelWidth === "number") {
      panelWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, localResult.wikistatPanelWidth));
      container.style.width = `${panelWidth}px`;
    }

    // Respect autoOpenPanel preference
    chrome.storage.sync.get("preferences", (syncResult) => {
      const autoOpen = syncResult.preferences?.autoOpenPanel ?? true;
      if (!autoOpen) return; // auto-open disabled — user must open manually
      // If user explicitly closed the panel last time, respect that
      if (localResult.wikistatPanelOpen === false) return;
      openPanel();
    });
  });

  // Clean up when context is invalidated (extension update, etc.)
  ctx.onInvalidated(() => {
    themeObserver.disconnect();
    container.remove();
    toggle.remove();
    document.body.style.marginRight = "";
    document.body.style.transition = "";
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function detectArticle(): ArticleInfo | null {
  const url = new URL(window.location.href);
  const match = url.pathname.match(/^\/wiki\/([^#?]+)/);
  if (!match) return null;

  const slug = decodeURIComponent(match[1]);
  if (isNonArticle(slug)) return null;

  const lang = url.hostname.split(".")[0];
  const h1 = document.querySelector<HTMLElement>(
    "#firstHeading .mw-page-title-main"
  );
  const title = h1?.textContent?.trim() || slug.replace(/_/g, " ");

  return { lang, slug, title };
}

