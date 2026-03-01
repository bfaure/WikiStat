import type {
  ArticleInfo,
  ExtensionMessage,
} from "../lib/types";

export default defineBackground(() => {
  // Per-tab article tracking — allows correct article display when switching tabs
  const tabArticles = new Map<number, ArticleInfo>();

  // Allow content scripts to read/write chrome.storage.session
  chrome.storage.session.setAccessLevel({
    accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
  });

  // Listen for messages from content scripts
  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, sender, sendResponse) => {
      switch (message.type) {
        case "ARTICLE_DETECTED": {
          const tabId = sender.tab?.id;
          if (tabId != null) {
            tabArticles.set(tabId, message.article);
          }
          break;
        }
        case "GET_CURRENT_ARTICLE":
          chrome.storage.session.get("currentArticle", (result) => {
            sendResponse(result.currentArticle ?? null);
          });
          return true;
      }
    }
  );

  // When user switches to a Wikipedia tab, update currentArticle
  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    const article = tabArticles.get(tabId);
    if (article) {
      await chrome.storage.session.set({ currentArticle: article });
    }
  });

  // Clean up when tabs are closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabArticles.delete(tabId);
  });

  // Clean up expired cache entries every 10 minutes
  setInterval(() => cleanExpiredCache(), 10 * 60_000);
  cleanExpiredCache();

  async function cleanExpiredCache() {
    try {
      const all = await chrome.storage.local.get(null);
      const now = Date.now();
      const expired = Object.keys(all).filter((key) => {
        const entry = all[key];
        return entry && typeof entry === "object" && "expiresAt" in entry && entry.expiresAt < now;
      });
      if (expired.length > 0) {
        await chrome.storage.local.remove(expired);
      }
    } catch {
      // Storage cleanup is best-effort
    }
  }
});
