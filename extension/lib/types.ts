/** Represents a Wikipedia article identified by language and slug */
export interface ArticleInfo {
  /** Language code (e.g., "en", "de", "fr") */
  lang: string;
  /** URL slug (e.g., "Albert_Einstein") */
  slug: string;
  /** Human-readable title (e.g., "Albert Einstein") */
  title: string;
}

/** Daily pageview data point */
export interface PageviewDay {
  date: string; // YYYY-MM-DD
  views: number;
}

/** Article quality class from Lift Wing */
export type QualityClass = "FA" | "GA" | "B" | "C" | "Start" | "Stub";

/** Article statistics from Wikimedia APIs */
export interface ArticleStats {
  pageviews: PageviewDay[];
  totalViews30d: number;
  dailyAverage30d: number;
  editCount: number;
  editorCount: number;
  lastEdit: {
    timestamp: string;
    editor: string;
    revid: number;
    comment: string;
    sizeDiff: number;
  } | null;
  createdAt: string | null; // ISO timestamp of first revision
  wikidataId: string | null; // e.g. "Q937"
  qualityClass: QualityClass | null;
  trendingRank: number | null; // null if not trending
  trendingViewsToday: number | null;
  wordCount: number | null; // estimated word count for reading time
  topEditors: TopEditor[] | null; // most active editors
  editHistory: EditDay[] | null; // daily edit counts
  protection: ProtectionInfo | null; // page protection status
}

/** Page protection information */
export interface ProtectionInfo {
  level: "autoconfirmed" | "extendedconfirmed" | "sysop" | "templateeditor" | string;
  type: "edit" | "move" | string;
  expiry: string | null; // ISO timestamp or null if indefinite
}

/** Daily edit count data point */
export interface EditDay {
  date: string; // YYYY-MM-DD
  edits: number;
}

/** A top editor for an article */
export interface TopEditor {
  name: string;
  editCount: number;
}

/** An article co-edited by multiple top editors */
export interface CoEditedArticle {
  title: string;
  slug: string;
  editorCount: number; // how many of the top editors also edit this
  totalEdits: number;  // total edits across all top editors
}

/** Messages between content script and background */
export type ExtensionMessage =
  | { type: "ARTICLE_DETECTED"; article: ArticleInfo }
  | { type: "GET_CURRENT_ARTICLE" };

/** Messages from background to side panel via port */
export type PanelMessage =
  | { type: "ARTICLE_UPDATED"; article: ArticleInfo }
  | { type: "NO_ARTICLE" };

/** Which panel sections are visible */
export interface SectionVisibility {
  overview: boolean;
  pageviews: boolean;
  viewSpikes: boolean;
  editActivity: boolean;
  topEditors: boolean;
  editorsAlsoEdited: boolean;
}

/** User preferences stored in chrome.storage.sync */
export interface UserPreferences {
  onboardingCompleted: boolean;
  darkMode: "auto" | "light" | "dark";
  autoOpenPanel: boolean;
  sections: SectionVisibility;
  chartHeights: { pageviews: number; editActivity: number };
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  onboardingCompleted: false,
  darkMode: "auto",
  autoOpenPanel: true,
  sections: {
    overview: true,
    pageviews: true,
    viewSpikes: true,
    editActivity: true,
    topEditors: true,
    editorsAlsoEdited: true,
  },
  chartHeights: { pageviews: 140, editActivity: 140 },
};
