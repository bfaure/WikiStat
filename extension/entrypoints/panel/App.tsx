import { useState, useEffect, useCallback, useMemo } from "react";
import type { ArticleInfo, ArticleStats as ArticleStatsType, QualityClass, UserPreferences, SectionVisibility } from "../../lib/types";
import { DEFAULT_PREFERENCES } from "../../lib/types";
import { fetchArticleStats } from "../../lib/wikipedia-api";
import { getPreferences, setPreferences } from "../../lib/storage";
import ArticleStats from "./components/ArticleStats";
import ViewsChart from "./components/ViewsChart";
import EditsChart from "./components/EditsChart";
import TrendingIndicator from "./components/TrendingIndicator";
import TopEditors from "./components/TopEditors";
import EditorsAlsoEdited from "./components/EditorsAlsoEdited";
import ViewSpikes, { detectSpikes } from "./components/ViewSpikes";

type LoadingState = "idle" | "loading" | "loaded" | "error";

const QUALITY_LABELS: Record<QualityClass, string> = {
  FA: "Featured", GA: "Good", B: "B-Class", C: "C-Class", Start: "Start", Stub: "Stub",
};

const QUALITY_DESCRIPTIONS: Record<QualityClass, string> = {
  FA: "Featured Article — meets Wikipedia's highest standards",
  GA: "Good Article — reliable sources, broad coverage",
  B: "B-Class — mostly complete, needs some work",
  C: "C-Class — substantial but missing important info",
  Start: "Start-Class — developing, still incomplete",
  Stub: "Stub — very basic, needs significant expansion",
};

export default function App() {
  const [article, setArticle] = useState<ArticleInfo | null>(null);
  const [stats, setStats] = useState<ArticleStatsType | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [chartRange, setChartRange] = useState(90);
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);

  // Load preferences + watch for changes
  useEffect(() => {
    getPreferences().then(setPrefs);

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "sync" && changes.preferences) {
        getPreferences().then(setPrefs);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const updateChartHeight = useCallback(async (chart: "pageviews" | "editActivity", h: number) => {
    const updated = await setPreferences({
      chartHeights: { ...prefs.chartHeights, [chart]: h },
    });
    setPrefs(updated);
  }, [prefs.chartHeights]);

  // Read current article from session storage on mount, then receive
  // updates via postMessage from this tab's content script only —
  // avoids cross-tab bleed through shared session storage.
  useEffect(() => {
    chrome.storage.session.get("currentArticle", (result) => {
      if (result.currentArticle) {
        setArticle(result.currentArticle);
      }
    });

    const handler = (e: MessageEvent) => {
      if (e.data?.type === "WIKISTAT_ARTICLE_CHANGE") {
        setArticle(e.data.article);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const loadStats = useCallback(async (info: ArticleInfo) => {
    // Clear stale stats immediately so we show skeletons, not old data
    setStats(null);
    setLoadingState("loading");
    setError(null);
    try {
      const data = await fetchArticleStats(info.lang, info.slug);
      setStats(data);
      setLoadingState("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
      setLoadingState("error");
    }
  }, []);

  // Fetch stats and scroll to top when article changes
  useEffect(() => {
    if (article) {
      loadStats(article);
      setChartRange(90); // Reset range on article change
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [article, loadStats]);

  // Spike detection scoped to the selected chart range.
  // Include SPIKE_LEAD extra days before the range so spikes near the
  // start still have a full rolling-median window for their baseline.
  const SPIKE_LEAD = 14;
  const spikeDates = useMemo(() => {
    if (!stats || stats.pageviews.length === 0) return new Set<string>();
    const leadSlice = stats.pageviews.slice(-(chartRange + SPIKE_LEAD));
    const rangeStartIndex = leadSlice.length - Math.min(chartRange, stats.pageviews.length);
    return new Set(detectSpikes(leadSlice, rangeStartIndex).map((s) => s.date));
  }, [stats, chartRange]);

  // Pageviews sliced to current range (for ViewSpikes)
  const rangePageviews = useMemo(() => {
    if (!stats) return [];
    return stats.pageviews.slice(-chartRange);
  }, [stats, chartRange]);

  // Extra leading days so ViewSpikes can compute rolling median for early days
  const leadPageviews = useMemo(() => {
    if (!stats || stats.pageviews.length <= chartRange) return [];
    return stats.pageviews.slice(-(chartRange + SPIKE_LEAD), -chartRange);
  }, [stats, chartRange]);

  // Top editors derived from editHistory, scoped to selected range
  const rangeTopEditors = useMemo(() => {
    if (!stats?.editHistory) return null;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - chartRange);
    const cutoff = cutoffDate.toISOString().slice(0, 10);
    const totals = new Map<string, number>();
    for (const day of stats.editHistory) {
      if (day.date < cutoff || !day.editors) continue;
      for (const [editor, count] of Object.entries(day.editors)) {
        totals.set(editor, (totals.get(editor) || 0) + count);
      }
    }
    if (totals.size === 0) return null;
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, editCount]) => ({ name, editCount }));
  }, [stats, chartRange]);

  if (!article) {
    return (
      <div>
        <div className="empty-state">
          <p style={{ fontSize: 32 }}>W</p>
          <p>Navigate to a Wikipedia article to see stats</p>
          <div className="empty-state-links">
            <p style={{ fontSize: 11, marginTop: 16, color: "var(--text-muted)" }}>
              Try one of these:
            </p>
            {[
              { title: "Albert Einstein", slug: "Albert_Einstein" },
              { title: "Climate change", slug: "Climate_change" },
              { title: "Moon landing", slug: "Moon_landing" },
            ].map((ex) => (
              <a
                key={ex.slug}
                className="empty-state-example"
                href={`https://en.wikipedia.org/wiki/${ex.slug}`}
                target="_blank"
                rel="noopener"
              >
                {ex.title}
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="article-meta">
        <span className="lang-badge">{article.lang.toUpperCase()}</span>
        {stats?.wikidataId && (
          <a
            className="wikidata-link"
            href={`https://www.wikidata.org/wiki/${stats.wikidataId}`}
            target="_blank"
            rel="noopener"
            title={`Wikidata: ${stats.wikidataId}`}
          >
            {stats.wikidataId}
          </a>
        )}
        <a
          className="talk-link"
          href={`https://${article.lang}.wikipedia.org/wiki/Talk:${encodeURIComponent(article.slug).replace(/%2F/g, "/")}`}
          target="_blank"
          rel="noopener"
          title="View article discussion page"
        >
          Talk
        </a>
        {stats?.qualityClass && (
          <span className={`meta-pill quality-${stats.qualityClass.toLowerCase()}`} title={QUALITY_DESCRIPTIONS[stats.qualityClass]}>
            {QUALITY_LABELS[stats.qualityClass]}
          </span>
        )}
        {stats?.protection && (
          <span className={`meta-pill protection-${stats.protection.level}`} title={`${stats.protection.type} protection: ${stats.protection.level}${stats.protection.expiry ? ` (until ${new Date(stats.protection.expiry).toLocaleDateString()})` : " (indefinite)"}`}>
            {stats.protection.level === "sysop" ? "Full-protected" : stats.protection.level === "extendedconfirmed" ? "Extended-protected" : "Semi-protected"}
          </span>
        )}
        <SettingsButton />
      </div>

      {loadingState === "error" && error && (
        <div className="error-state">
          <p>{error}</p>
          <button className="retry-btn" onClick={() => loadStats(article)}>
            Retry
          </button>
        </div>
      )}

      {stats?.trendingRank != null && (
        <TrendingIndicator
          rank={stats.trendingRank}
          views={stats.trendingViewsToday}
        />
      )}

      {prefs.sections.overview && (
        <ArticleStats stats={stats} loading={loadingState === "loading"} lang={article.lang} />
      )}

      {prefs.sections.pageviews && (
        <ViewsChart
          pageviews={stats?.pageviews ?? []}
          loading={loadingState === "loading"}
          spikeDates={spikeDates}
          rangeDays={chartRange}
          onRangeChange={setChartRange}
          height={prefs.chartHeights.pageviews}
          onHeightChange={(h) => updateChartHeight("pageviews", h)}
        />
      )}

      {prefs.sections.viewSpikes && rangePageviews.length > 0 && (
        <ViewSpikes pageviews={rangePageviews} leadPageviews={leadPageviews} articleTitle={article.title} rangeDays={chartRange} />
      )}

      {prefs.sections.editActivity && (
        <EditsChart
          editHistory={stats?.editHistory ?? null}
          loading={loadingState === "loading"}
          rangeDays={chartRange}
          lang={article.lang}
          slug={article.slug}
          height={prefs.chartHeights.editActivity}
          onHeightChange={(h) => updateChartHeight("editActivity", h)}
        />
      )}

      {prefs.sections.topEditors && (
        <TopEditors
          editors={rangeTopEditors}
          loading={loadingState === "loading"}
          lang={article.lang}
          rangeDays={chartRange}
        />
      )}

      {prefs.sections.editorsAlsoEdited && rangeTopEditors && rangeTopEditors.length > 0 && (
        <EditorsAlsoEdited
          lang={article.lang}
          slug={article.slug}
        />
      )}
    </div>
  );
}

const SECTION_LABELS: Record<keyof SectionVisibility, string> = {
  overview: "Overview",
  pageviews: "Pageviews",
  viewSpikes: "View Spikes",
  editActivity: "Edit Activity",
  topEditors: "Top Editors",
  editorsAlsoEdited: "Editors Also Edited",
};

function SettingsButton() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);

  useEffect(() => {
    getPreferences().then(setPrefs);

    const listener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area === "sync" && changes.preferences) {
        getPreferences().then(setPrefs);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const togglePref = async (key: keyof UserPreferences, value: boolean) => {
    const updated = await setPreferences({ [key]: value });
    setPrefs(updated);
  };

  const toggleSection = async (key: keyof SectionVisibility, value: boolean) => {
    if (!prefs) return;
    const updated = await setPreferences({
      sections: { ...prefs.sections, [key]: value },
    });
    setPrefs(updated);
  };

  const resetDefaults = async () => {
    const updated = await setPreferences({
      sections: { ...DEFAULT_PREFERENCES.sections },
      chartHeights: { ...DEFAULT_PREFERENCES.chartHeights },
      autoOpenPanel: DEFAULT_PREFERENCES.autoOpenPanel,
    });
    setPrefs(updated);
  };

  return (
    <>
      <button
        className="header-settings-btn"
        onClick={() => setSettingsOpen(!settingsOpen)}
        title="Settings"
        aria-expanded={settingsOpen}
        style={{ marginLeft: "auto" }}
      >
        {"\u2699"}
      </button>
      {settingsOpen && prefs && (
        <div className="header-settings-dropdown">
          <div className="settings-toggle">
            <label htmlFor="autoOpen">Auto-open panel</label>
            <div className="toggle-switch">
              <input
                type="checkbox"
                id="autoOpen"
                checked={prefs.autoOpenPanel}
                onChange={(e) => togglePref("autoOpenPanel", e.target.checked)}
              />
              <span className="toggle-slider" />
            </div>
          </div>

          <div className="settings-group-label">Sections</div>
          {(Object.keys(SECTION_LABELS) as Array<keyof SectionVisibility>).map((key) => (
            <div className="settings-toggle" key={key}>
              <label htmlFor={`section-${key}`}>{SECTION_LABELS[key]}</label>
              <div className="toggle-switch">
                <input
                  type="checkbox"
                  id={`section-${key}`}
                  checked={prefs.sections[key]}
                  onChange={(e) => toggleSection(key, e.target.checked)}
                />
                <span className="toggle-slider" />
              </div>
            </div>
          ))}

          <button className="reset-defaults-btn" onClick={resetDefaults}>
            Reset to defaults
          </button>
        </div>
      )}
    </>
  );
}
