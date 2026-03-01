import type { ArticleStats } from "../../../lib/types";

interface Props {
  stats: ArticleStats | null;
  loading: boolean;
}

export default function EditorsInfo({ stats, loading }: Props) {
  if (loading) {
    return (
      <div className="section">
        <div className="section-title">Article Details</div>
        <div className="skeleton skeleton-text" style={{ width: "80%" }} />
        <div className="skeleton skeleton-text" style={{ width: "60%" }} />
      </div>
    );
  }

  if (!stats) return null;

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

  return (
    <div className="section">
      <div className="section-title">Article Details</div>
      <div className="stat-grid">
        <div className="stat-item">
          <span className="stat-value">{editsPerEditor}</span>
          <span className="stat-label">Edits / editor</span>
        </div>
        {stats.wordCount != null && (
          <div className="stat-item">
            <span className="stat-value">{formatReadingTime(stats.wordCount)}</span>
            <span className="stat-label">Reading time</span>
          </div>
        )}
        {createdDate && (
          <div className="stat-item" style={{ gridColumn: "1 / -1" }}>
            <span className="stat-value" style={{ fontSize: 16 }}>
              {createdDate}
            </span>
            <span className="stat-label">
              Created{articleAge ? ` (${articleAge})` : ""}
            </span>
          </div>
        )}
      </div>
    </div>
  );
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
