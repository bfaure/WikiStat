import { useState } from "react";
import type { ArticleStats as ArticleStatsType } from "../../../lib/types";
import { formatNumber, formatTimeAgo } from "../../../lib/format";
import { fetchRevisionDiff } from "../../../lib/wikipedia-api";

interface Props {
  stats: ArticleStatsType | null;
  loading: boolean;
  lang: string;
}

export default function ArticleStats({ stats, loading, lang }: Props) {
  const [lastEditExpanded, setLastEditExpanded] = useState(false);
  const [diffHtml, setDiffHtml] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  if (loading) {
    return (
      <div className="section">
        <div className="section-title">Overview</div>
        <div className="stat-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="stat-item" key={i}>
              <div className="skeleton skeleton-text" style={{ width: 80, marginBottom: 0 }} />
              <div className="skeleton skeleton-text" style={{ width: 50, marginBottom: 0 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  // Compare last 30d vs prior 30d (days 31-60) to show trend
  const viewsTrend = getViewsTrend(stats);

  const editsPerEditor =
    stats.editorCount > 0
      ? (stats.editCount / stats.editorCount).toFixed(1)
      : "\u2014";

  const createdDate = stats.createdAt
    ? new Date(stats.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const articleAge = stats.createdAt ? getArticleAge(stats.createdAt) : null;

  const toggleLastEdit = async () => {
    if (lastEditExpanded) {
      setLastEditExpanded(false);
      return;
    }
    setLastEditExpanded(true);
    if (diffHtml !== null || !stats.lastEdit) return;

    setDiffLoading(true);
    try {
      const html = await fetchRevisionDiff(lang, stats.lastEdit.revid);
      setDiffHtml(html);
    } catch {
      setDiffHtml("");
    } finally {
      setDiffLoading(false);
    }
  };

  return (
    <div className="section">
      <div className="section-title">Overview</div>
      <div className="stat-grid">
        <div className="stat-item">
          <span className="stat-label">Views (30d)</span>
          <span className="stat-value">
            {formatNumber(stats.totalViews30d)}
            {viewsTrend !== null && (
              <span
                className={`stat-trend ${viewsTrend >= 0 ? "trend-up" : "trend-down"}`}
                title={`${viewsTrend >= 0 ? "+" : ""}${viewsTrend.toFixed(0)}% vs prior 30 days`}
              >
                {viewsTrend >= 0 ? "\u25B2" : "\u25BC"} {Math.abs(viewsTrend).toFixed(0)}%
              </span>
            )}
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Daily avg</span>
          <span className="stat-value">{formatNumber(stats.dailyAverage30d)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total edits</span>
          <span className="stat-value">{formatNumber(stats.editCount)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Editors</span>
          <span className="stat-value">{formatNumber(stats.editorCount)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Edits / editor</span>
          <span className="stat-value">{editsPerEditor}</span>
        </div>
        {stats.wordCount != null && (
          <div className="stat-item">
            <span className="stat-label">Reading time</span>
            <span className="stat-value">{formatReadingTime(stats.wordCount)}</span>
          </div>
        )}
        {createdDate && (
          <div className="stat-item">
            <span className="stat-label">
              Created{articleAge ? ` (${articleAge})` : ""}
            </span>
            <span className="stat-value">{createdDate}</span>
          </div>
        )}
      </div>

      {stats.lastEdit && (
        <div className="last-edit-section">
          <button className="last-edit-toggle" onClick={toggleLastEdit}>
            <span className="edit-row-chevron" style={{ transform: lastEditExpanded ? "rotate(90deg)" : "none" }}>
              {"\u25B6"}
            </span>
            <span className="last-edit-summary">
              Last edited{" "}
              <span title={new Date(stats.lastEdit.timestamp).toLocaleString()}>
                {formatTimeAgo(stats.lastEdit.timestamp)}
              </span>{" "}
              by <strong>{stats.lastEdit.editor}</strong>
              <span className={`edit-preview-diff ${stats.lastEdit.sizeDiff > 0 ? "diff-add" : stats.lastEdit.sizeDiff < 0 ? "diff-remove" : ""}`} style={{ marginLeft: 6 }}>
                {stats.lastEdit.sizeDiff > 0 ? "+" : ""}{stats.lastEdit.sizeDiff.toLocaleString()}
              </span>
            </span>
          </button>

          {lastEditExpanded && (
            <>
              {stats.lastEdit.comment && (
                <div className="edit-preview-comment">
                  {stats.lastEdit.comment}
                </div>
              )}
              <div className="edit-diff-container">
                {diffLoading ? (
                  <div style={{ padding: "8px 0" }}>
                    <div className="skeleton skeleton-text" style={{ width: "100%" }} />
                    <div className="skeleton skeleton-text" style={{ width: "85%" }} />
                  </div>
                ) : diffHtml ? (
                  <div
                    className="edit-diff-content"
                    dangerouslySetInnerHTML={{ __html: diffHtml }}
                  />
                ) : (
                  <p style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 0" }}>
                    No diff available (may be the first revision).
                  </p>
                )}
                <a
                  className="edit-diff-link"
                  href={`https://${lang}.wikipedia.org/w/index.php?diff=${stats.lastEdit.revid}`}
                  target="_blank"
                  rel="noopener"
                >
                  View full diff on Wikipedia
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Calculate % change of views: last 30d vs prior 30d. Returns null if not enough data. */
function getViewsTrend(stats: ArticleStatsType): number | null {
  const pv = stats.pageviews;
  if (pv.length < 60) return null;

  const last30 = pv.slice(-30).reduce((s, d) => s + d.views, 0);
  const prior30 = pv.slice(-60, -30).reduce((s, d) => s + d.views, 0);

  if (prior30 === 0) return null;
  return ((last30 - prior30) / prior30) * 100;
}

function formatReadingTime(wordCount: number): string {
  const minutes = Math.ceil(wordCount / 238); // average reading speed
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`;
}

function getArticleAge(timestamp: string): string {
  const created = new Date(timestamp);
  const now = new Date();
  const years = now.getFullYear() - created.getFullYear();
  const months = now.getMonth() - created.getMonth();
  const totalMonths = years * 12 + months;

  if (totalMonths < 1) return "this month";
  if (totalMonths < 12) return `${totalMonths} month${totalMonths > 1 ? "s" : ""} ago`;
  const y = Math.floor(totalMonths / 12);
  return `${y} year${y > 1 ? "s" : ""} ago`;
}
