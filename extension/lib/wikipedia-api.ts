import type { ArticleStats, CoEditedArticle, EditDay, PageviewDay, ProtectionInfo, QualityClass, TopEditor } from "./types";
import { cacheGet, cacheSet } from "./storage";

const USER_AGENT = "WikiStat/0.1.0 (https://github.com/wikistat; contact@wikistat.app)";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// In-flight request deduplication — avoid duplicate fetches for the same article
const inFlight = new Map<string, Promise<ArticleStats>>();

/** Fetch all article stats in parallel */
export async function fetchArticleStats(
  lang: string,
  slug: string
): Promise<ArticleStats> {
  const cacheKey = `stats:${lang}:${slug}`;
  const cached = await cacheGet<ArticleStats>(cacheKey);
  if (cached) return cached;

  // Return existing in-flight request if one exists
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;

  const promise = fetchArticleStatsImpl(lang, slug, cacheKey);
  inFlight.set(cacheKey, promise);
  promise.finally(() => inFlight.delete(cacheKey));
  return promise;
}

async function fetchArticleStatsImpl(
  lang: string,
  slug: string,
  cacheKey: string,
): Promise<ArticleStats> {

  // Encode the slug for URLs — keep underscores, encode the rest
  const encodedSlug = encodeURIComponent(slug).replace(/%2F/g, "/");

  const [pageviews, editCount, editorCount, lastEdit, quality, trending, pageInfo, createdAt, parsedInfo, topEditors, editHistory] =
    await Promise.allSettled([
      fetchPageviews(lang, encodedSlug, 730), // 2 years
      fetchEditCount(lang, encodedSlug),
      fetchEditorCount(lang, encodedSlug),
      fetchLastEdit(lang, encodedSlug),
      fetchQuality(lang, slug),
      fetchTrending(lang, slug),
      fetchPageInfo(lang, slug),
      fetchCreatedAt(lang, slug),
      fetchParsedInfo(lang, slug),
      fetchTopEditors(lang, slug),
      fetchEditHistory(lang, slug),
    ]);

  const pageviewData = settled(pageviews, [] as PageviewDay[]);
  const totalViews30d = pageviewData
    .slice(-30)
    .reduce((sum, d) => sum + d.views, 0);

  const stats: ArticleStats = {
    pageviews: pageviewData,
    totalViews30d,
    dailyAverage30d: pageviewData.length > 0 ? Math.round(totalViews30d / Math.min(30, pageviewData.length)) : 0,
    editCount: settled(editCount, 0),
    editorCount: settled(editorCount, 0),
    lastEdit: settled(lastEdit, null),
    createdAt: settled(createdAt, null),
    wikidataId: settled(pageInfo, { wikidataId: null, protection: null }).wikidataId,
    protection: settled(pageInfo, { wikidataId: null, protection: null }).protection,
    qualityClass: settled(quality, null),
    trendingRank: settled(trending, { rank: null, views: null }).rank,
    trendingViewsToday: settled(trending, { rank: null, views: null }).views,
    wordCount: settled(parsedInfo, null),
    topEditors: settled(topEditors, null),
    editHistory: settled(editHistory, null),
  };

  await cacheSet(cacheKey, stats, CACHE_TTL);
  return stats;
}

/** Extract value from PromiseSettledResult with fallback */
function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  if (result.status === "rejected") {
    console.warn("[WikiStat] API call failed:", result.reason);
  }
  return result.status === "fulfilled" ? result.value : fallback;
}

/** A single revision entry for the edit preview */
export interface RevisionEntry {
  revid: number;
  timestamp: string;
  user: string;
  comment: string;
  sizeDiff: number; // bytes added/removed
}

/** Fetch revisions for an article within a date range */
export async function fetchRevisions(
  lang: string,
  slug: string,
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
): Promise<RevisionEntry[]> {
  const title = slug.replace(/_/g, " ");
  // rvstart/rvend are reversed: rvstart is the newer date, rvend is the older date
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "revisions",
    rvprop: "ids|timestamp|user|comment|size",
    rvstart: endDate + "T23:59:59Z",
    rvend: startDate + "T00:00:00Z",
    rvlimit: "50",
    format: "json",
    origin: "*",
  });

  const url = `https://${lang}.wikipedia.org/w/api.php?${params}`;
  const res = await wikiApiFetch(url);
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return [];

  const page = Object.values(pages)[0] as {
    revisions?: Array<{ revid: number; timestamp: string; user: string; comment: string; size: number }>;
  } | undefined;

  if (!page?.revisions) return [];

  const revisions = page.revisions;

  // Calculate size diffs (revisions come newest-first)
  return revisions.map((rev, i) => {
    const prevSize = i < revisions.length - 1 ? revisions[i + 1].size : rev.size;
    return {
      revid: rev.revid,
      timestamp: rev.timestamp,
      user: rev.user || "Anonymous",
      comment: rev.comment || "(no edit summary)",
      sizeDiff: rev.size - prevSize,
    };
  });
}

/** Fetch the diff HTML for a specific revision compared to its parent */
export async function fetchRevisionDiff(
  lang: string,
  revid: number,
): Promise<string> {
  const params = new URLSearchParams({
    action: "compare",
    fromrev: String(revid),
    torelative: "prev",
    format: "json",
    origin: "*",
  });

  const url = `https://${lang}.wikipedia.org/w/api.php?${params}`;
  const res = await wikiApiFetch(url);
  const data = await res.json();

  if (data.compare?.["*"] != null) {
    return data.compare["*"];
  }

  return "";
}

const FETCH_TIMEOUT = 10_000; // 10 seconds

/** Fetch with User-Agent, timeout, and retry on 429 */
async function wikiApiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Api-User-Agent", USER_AGENT);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });

    if (res.status === 429) {
      // Retry once after backoff, with its own timeout
      const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      const retryController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryController.abort(), FETCH_TIMEOUT);
      try {
        return await fetch(url, { ...init, headers, signal: retryController.signal });
      } finally {
        clearTimeout(retryTimeoutId);
      }
    }

    if (res.status === 404) {
      throw new Error(`Not found: ${url}`);
    }

    if (!res.ok) {
      throw new Error(`Wikipedia API error: ${res.status} ${res.statusText}`);
    }

    return res;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request timed out: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Pageviews (Analytics API) ──────────────────────────────────────────────

async function fetchPageviews(lang: string, slug: string, days = 90): Promise<PageviewDay[]> {
  const fmt = (d: Date) =>
    d.toISOString().slice(0, 10).replace(/-/g, "");

  // Try progressively shorter ranges — the Pageviews API returns 404
  // when there's no data in the requested range (common for new articles)
  const rangesToTry = [days, 365, 90, 30].filter((r) => r <= days);
  // Deduplicate while preserving order
  const uniqueRanges = [...new Set(rangesToTry)];

  for (const range of uniqueRanges) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - range);

    const url =
      `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/` +
      `${lang}.wikipedia/all-access/user/${slug}/daily/${fmt(start)}/${fmt(end)}`;

    try {
      const res = await wikiApiFetch(url);
      const data = await res.json();

      return (data.items || []).map(
        (item: { timestamp: string; views: number }) => ({
          date: `${item.timestamp.slice(0, 4)}-${item.timestamp.slice(4, 6)}-${item.timestamp.slice(6, 8)}`,
          views: item.views,
        })
      );
    } catch {
      // If this range failed (likely 404), try a shorter one
      continue;
    }
  }

  return [];
}

// ─── Edit & Editor counts (Core REST API) ───────────────────────────────────

async function fetchEditCount(lang: string, slug: string): Promise<number> {
  const url = `https://${lang}.wikipedia.org/w/rest.php/v1/page/${slug}/history/counts/edits`;
  const res = await wikiApiFetch(url);
  const data = await res.json();
  return data.count ?? 0;
}

async function fetchEditorCount(lang: string, slug: string): Promise<number> {
  const url = `https://${lang}.wikipedia.org/w/rest.php/v1/page/${slug}/history/counts/editors`;
  const res = await wikiApiFetch(url);
  const data = await res.json();
  return data.count ?? 0;
}

// ─── Last edit (Core REST API) ──────────────────────────────────────────────

async function fetchLastEdit(
  lang: string,
  slug: string
): Promise<{ timestamp: string; editor: string; revid: number; comment: string; sizeDiff: number } | null> {
  const url = `https://${lang}.wikipedia.org/w/rest.php/v1/page/${slug}/history?limit=1`;
  const res = await wikiApiFetch(url);
  const data = await res.json();
  const revision = data.revisions?.[0];
  if (!revision) return null;
  return {
    timestamp: revision.timestamp,
    editor: revision.user?.name || "Anonymous",
    revid: revision.id,
    comment: revision.comment || "",
    sizeDiff: revision.delta ?? 0,
  };
}

// ─── Article quality (Lift Wing API) ────────────────────────────────────────

async function fetchQuality(lang: string, slug: string): Promise<QualityClass | null> {
  // Lift Wing only supports certain wikis
  const supportedWikis = ["enwiki", "frwiki", "ruwiki", "svwiki", "trwiki"];
  const wiki = `${lang}wiki`;
  if (!supportedWikis.includes(wiki)) return null;

  try {
    // First get the latest revision ID
    const revUrl = `https://${lang}.wikipedia.org/w/rest.php/v1/page/${encodeURIComponent(slug)}/history?limit=1`;
    const revRes = await wikiApiFetch(revUrl);
    const revData = await revRes.json();
    const revId = revData.revisions?.[0]?.id;
    if (!revId) return null;

    const url = `https://api.wikimedia.org/service/lw/inference/v1/models/${wiki}-articlequality:predict`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Api-User-Agent": USER_AGENT },
      body: JSON.stringify({ rev_id: revId }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const predictions = data?.[wiki]?.scores?.[String(revId)]?.articlequality?.score?.prediction;
    if (!predictions) return null;

    return predictions as QualityClass;
  } catch {
    return null;
  }
}

// ─── Trending / Most Read (Feed API) ────────────────────────────────────────

async function fetchTrending(
  lang: string,
  slug: string
): Promise<{ rank: number | null; views: number | null }> {
  const now = new Date();
  // Most-read is for the previous day
  now.setDate(now.getDate() - 1);
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const url = `https://${lang}.wikipedia.org/api/rest_v1/feed/featured/${yyyy}/${mm}/${dd}`;
  const res = await wikiApiFetch(url);
  const data = await res.json();

  const articles: Array<{ title: string; views: number; rank: number }> =
    data?.mostread?.articles || [];

  const normalizedSlug = slug.replace(/ /g, "_");
  const entry = articles.find(
    (a) => a.title.replace(/ /g, "_") === normalizedSlug
  );

  if (!entry) return { rank: null, views: null };
  return { rank: entry.rank, views: entry.views };
}

// ─── Page info (Action API — Wikidata ID) ────────────────────────────────────

async function fetchPageInfo(lang: string, slug: string): Promise<{
  wikidataId: string | null;
  protection: ProtectionInfo | null;
}> {
  const title = slug.replace(/_/g, " ");
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "pageprops|info",
    ppprop: "wikibase_item",
    inprop: "protection",
    format: "json",
    origin: "*",
  });

  const url = `https://${lang}.wikipedia.org/w/api.php?${params}`;
  const res = await wikiApiFetch(url);
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return { wikidataId: null, protection: null };

  const page = Object.values(pages)[0] as {
    pageprops?: { wikibase_item?: string };
    protection?: Array<{ type: string; level: string; expiry: string }>;
  } | undefined;

  // Protection — find the most restrictive edit protection
  let protection: ProtectionInfo | null = null;
  if (page?.protection) {
    const editProtection = page.protection.find((p) => p.type === "edit" && p.level !== "autoconfirmed");
    const moveProtection = page.protection.find((p) => p.type === "move");
    const prot = editProtection || moveProtection;
    if (prot) {
      protection = {
        level: prot.level,
        type: prot.type,
        expiry: prot.expiry === "infinity" ? null : prot.expiry,
      };
    }
  }

  return {
    wikidataId: page?.pageprops?.wikibase_item ?? null,
    protection,
  };
}

// ─── Word count (TextExtracts API) ──────────────────────────────────────────

async function fetchParsedInfo(lang: string, slug: string): Promise<number | null> {
  const title = slug.replace(/_/g, " ");
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "extracts",
    explaintext: "1",
    exlimit: "1",
    format: "json",
    origin: "*",
  });

  const url = `https://${lang}.wikipedia.org/w/api.php?${params}`;
  const res = await wikiApiFetch(url);
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;

  const page = Object.values(pages)[0] as { extract?: string } | undefined;
  if (!page?.extract) return null;

  const words = page.extract.split(/\s+/).filter((w: string) => w.length > 0);
  return words.length;
}

// ─── Created date (Action API — first revision) ────────────────────────────

async function fetchCreatedAt(lang: string, slug: string): Promise<string | null> {
  const title = slug.replace(/_/g, " ");
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "revisions",
    rvprop: "timestamp",
    rvlimit: "1",
    rvdir: "newer", // oldest first
    format: "json",
    origin: "*",
  });

  const url = `https://${lang}.wikipedia.org/w/api.php?${params}`;
  const res = await wikiApiFetch(url);
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;

  const page = Object.values(pages)[0] as { revisions?: Array<{ timestamp: string }> } | undefined;
  return page?.revisions?.[0]?.timestamp ?? null;
}

// ─── Top editors (Action API — contributors) ────────────────────────────────

async function fetchTopEditors(lang: string, slug: string): Promise<TopEditor[]> {
  const title = slug.replace(/_/g, " ");
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "contributors",
    pclimit: "50",
    format: "json",
    origin: "*",
  });

  const url = `https://${lang}.wikipedia.org/w/api.php?${params}`;
  const res = await wikiApiFetch(url);
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return [];

  const page = Object.values(pages)[0] as { contributors?: Array<{ userid: number; name: string }> } | undefined;
  if (!page?.contributors) return [];

  // The contributors API doesn't return edit counts per editor directly.
  // Fetch recent revision history to count per-editor edits (last 500 revisions)
  const revParams = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "revisions",
    rvprop: "user|timestamp",
    rvlimit: "500",
    format: "json",
    origin: "*",
  });

  const revRes = await wikiApiFetch(`https://${lang}.wikipedia.org/w/api.php?${revParams}`);
  const revData = await revRes.json();
  const revPages = revData?.query?.pages;
  if (!revPages) return [];

  const revPage = Object.values(revPages)[0] as { revisions?: Array<{ user: string; timestamp: string }> } | undefined;
  if (!revPage?.revisions) return [];

  // Score editors: each edit gets a recency boost.
  // An edit from today scores 1.0, an edit from 1 year ago scores ~0.25.
  // score = sum of (1 / (1 + daysSinceEdit / 120)) per edit
  const now = Date.now();
  const scores = new Map<string, { score: number; editCount: number }>();
  for (const rev of revPage.revisions) {
    if (!rev.user) continue;
    const daysAgo = (now - new Date(rev.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    const recencyWeight = 1 / (1 + daysAgo / 120);
    const existing = scores.get(rev.user);
    if (existing) {
      existing.score += recencyWeight;
      existing.editCount += 1;
    } else {
      scores.set(rev.user, { score: recencyWeight, editCount: 1 });
    }
  }

  // Sort by weighted score descending, take top 5
  return Array.from(scores.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 5)
    .map(([name, { editCount }]) => ({ name, editCount }));
}

// ─── Edit history (Action API — daily edit counts from revisions) ────────────

async function fetchEditHistory(lang: string, slug: string): Promise<EditDay[]> {
  const title = slug.replace(/_/g, " ");

  // Fetch recent revisions (up to 500) to build daily edit counts
  const params = new URLSearchParams({
    action: "query",
    titles: title,
    prop: "revisions",
    rvprop: "timestamp",
    rvlimit: "500",
    format: "json",
    origin: "*",
  });

  const res = await wikiApiFetch(`https://${lang}.wikipedia.org/w/api.php?${params}`);
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return [];

  const page = Object.values(pages)[0] as { revisions?: Array<{ timestamp: string }> } | undefined;
  if (!page?.revisions) return [];

  // Group revisions by day
  const dayCounts = new Map<string, number>();
  for (const rev of page.revisions) {
    const day = rev.timestamp.slice(0, 10); // YYYY-MM-DD
    dayCounts.set(day, (dayCounts.get(day) || 0) + 1);
  }

  // Fill in missing days with 0 edits for a continuous series up to today
  const days = Array.from(dayCounts.keys()).sort();
  if (days.length === 0) return [];

  const result: EditDay[] = [];
  const startDate = new Date(days[0]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = today > new Date(days[days.length - 1]) ? today : new Date(days[days.length - 1]);

  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const key = cursor.toISOString().slice(0, 10);
    result.push({ date: key, edits: dayCounts.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}

// ─── Editor contributions (Action API — usercontribs) ────────────────────────

export interface EditorContributionsResult {
  articles: CoEditedArticle[];
  editorsAnalyzed: number;
}

/**
 * Fetch articles co-edited by editors of the current article.
 * 1. Gets the last 500 revisions → extracts up to 50 unique registered editors
 * 2. Fetches each editor's last 100 contributions (parallel, 5 at a time)
 * 3. Aggregates by article → counts distinct editors who also edit it
 */
export async function fetchEditorContributions(
  lang: string,
  currentSlug: string,
): Promise<EditorContributionsResult> {
  const currentTitle = currentSlug.replace(/_/g, " ");

  // Step 1: Get unique registered editors from the last 500 revisions
  const revParams = new URLSearchParams({
    action: "query",
    titles: currentTitle,
    prop: "revisions",
    rvprop: "user",
    rvlimit: "500",
    format: "json",
    origin: "*",
  });

  const revRes = await wikiApiFetch(`https://${lang}.wikipedia.org/w/api.php?${revParams}`);
  const revData = await revRes.json();
  const pages = revData?.query?.pages;
  if (!pages) return { articles: [], editorsAnalyzed: 0 };

  const page = Object.values(pages)[0] as { revisions?: Array<{ user: string }> } | undefined;
  if (!page?.revisions) return { articles: [], editorsAnalyzed: 0 };

  // Filter out IP/anonymous editors (IPv4 or IPv6 patterns) and collect unique names
  const ipPattern = /^[\d.:a-fA-F]+$/;
  const seen = new Set<string>();
  const editors: string[] = [];
  for (const rev of page.revisions) {
    if (rev.user && !seen.has(rev.user) && !ipPattern.test(rev.user)) {
      seen.add(rev.user);
      editors.push(rev.user);
      if (editors.length >= 50) break;
    }
  }

  if (editors.length === 0) return { articles: [], editorsAnalyzed: 0 };

  // Step 2: Fetch each editor's last 100 contributions, 5 in parallel
  const articleMap = new Map<string, { editors: Set<string>; totalEdits: number }>();
  const CONCURRENCY = 5;

  for (let i = 0; i < editors.length; i += CONCURRENCY) {
    if (i > 0) await new Promise((r) => setTimeout(r, 100));

    const batch = editors.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (editor) => {
        const params = new URLSearchParams({
          action: "query",
          list: "usercontribs",
          ucuser: editor,
          ucprop: "title",
          uclimit: "100",
          ucnamespace: "0",
          format: "json",
          origin: "*",
        });
        const url = `https://${lang}.wikipedia.org/w/api.php?${params}`;
        const res = await wikiApiFetch(url);
        const data = await res.json();
        return {
          editor,
          contribs: (data?.query?.usercontribs || []) as Array<{ title: string }>,
        };
      })
    );

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const { editor, contribs } = result.value;
      // Deduplicate per editor — only count each article once per editor
      const editorArticles = new Set<string>();
      for (const c of contribs) {
        editorArticles.add(c.title);
      }
      for (const title of editorArticles) {
        if (title === currentTitle) continue;
        const existing = articleMap.get(title);
        if (existing) {
          existing.editors.add(editor);
          existing.totalEdits += 1;
        } else {
          articleMap.set(title, { editors: new Set([editor]), totalEdits: 1 });
        }
      }
    }
  }

  // Step 3: Sort by editor overlap count (desc), then total edits (desc)
  const articles = Array.from(articleMap.entries())
    .map(([title, { editors: eds, totalEdits }]) => ({
      title,
      slug: title.replace(/ /g, "_"),
      editorCount: eds.size,
      totalEdits,
    }))
    .sort((a, b) => b.editorCount - a.editorCount || b.totalEdits - a.totalEdits)
    .slice(0, 10);

  return { articles, editorsAnalyzed: editors.length };
}
