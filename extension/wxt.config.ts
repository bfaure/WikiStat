import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: ".",
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "WikiStat",
    description:
      "Wikipedia article statistics, quality insights, and navigation recommendations",
    version: "0.2.0",
    permissions: ["storage", "activeTab", "tabs"],
    host_permissions: ["*://*.wikipedia.org/*", "*://*.wikimedia.org/*"],
    icons: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
    web_accessible_resources: [
      {
        resources: ["panel.html", "chunks/*", "assets/*"],
        matches: ["*://*.wikipedia.org/*"],
      },
    ],
  },
  webExt: {
    startUrls: ["https://en.wikipedia.org/wiki/Albert_Einstein"],
  },
});
