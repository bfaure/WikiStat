import { useState } from "react";
import type { PageviewDay } from "../../../lib/types";
import { formatNumber } from "../../../lib/format";

interface Props {
  pageviews: PageviewDay[];
  articleTitle: string;
  rangeDays?: number;
}

export interface Spike {
  date: string;
  views: number;
  average: number;
  multiplier: number;
  period: string; // human-readable
}

export default function ViewSpikes({ pageviews, articleTitle, rangeDays = 90 }: Props) {
  const spikes = detectSpikes(pageviews);

  // Show top 5 spikes
  const topSpikes = spikes.slice(0, 5);

  return (
    <div className="section">
      <div className="section-title">
        Notable View Changes {spikes.length > 0 ? `(${spikes.length})` : ""}
      </div>
      {topSpikes.length === 0 ? (
        <p style={{ fontSize: "inherit", color: "var(--text-muted)", padding: "0.4em 0.6em" }}>
          No unusual view spikes in the last {rangeDays <= 365 ? `${rangeDays} days` : `${Math.round(rangeDays / 365)} years`}.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {topSpikes.map((spike) => (
            <SpikeItem
              key={spike.date}
              spike={spike}
              articleTitle={articleTitle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SpikeItem({ spike, articleTitle }: { spike: Spike; articleTitle: string }) {
  const [showSearch, setShowSearch] = useState(false);
  const searchDate = new Date(spike.date);
  const dateStr = searchDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Build a Google News search URL scoped to around that date
  const startDate = new Date(searchDate);
  startDate.setDate(startDate.getDate() - 2);
  const endDate = new Date(searchDate);
  endDate.setDate(endDate.getDate() + 2);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(articleTitle)}&tbs=cdr:1,cd_min:${fmt(startDate)},cd_max:${fmt(endDate)}&tbm=nws`;

  return (
    <div className="spike-item">
      <div className="spike-header">
        <div>
          <span className="spike-date">{dateStr}</span>
          <span className="spike-multiplier">{spike.multiplier.toFixed(1)}x normal</span>
        </div>
        <span className="spike-views">{formatNumber(spike.views)} views</span>
      </div>
      <button
        className="spike-explain-btn"
        onClick={() => setShowSearch(!showSearch)}
      >
        {showSearch ? "Hide" : "Why the spike?"}
      </button>
      {showSearch && (
        <div className="spike-explain">
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
            Views were {spike.multiplier.toFixed(1)}x higher than the {formatNumber(Math.round(spike.average))} daily median.
            This often correlates with news events, viral content, or deaths/anniversaries.
          </p>
          <a
            className="spike-search-link"
            href={googleUrl}
            target="_blank"
            rel="noopener"
          >
            Search Google News for &ldquo;{articleTitle}&rdquo; around {dateStr}
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * Detect significant view spikes using a rolling median comparison.
 * A spike is a day with views > 1.75x the 14-day rolling median.
 * Median is used instead of mean so that lead-up days before a spike
 * don't inflate the baseline and mask the spike.
 */
export function detectSpikes(pageviews: PageviewDay[]): Spike[] {
  if (pageviews.length < 21) return []; // Need enough data for rolling window

  const spikes: Spike[] = [];
  const WINDOW = 14;
  const THRESHOLD = 1.75;

  for (let i = WINDOW; i < pageviews.length; i++) {
    const day = pageviews[i];
    // Rolling median of the WINDOW days before this day
    const windowViews = pageviews.slice(i - WINDOW, i).map((d) => d.views).sort((a, b) => a - b);
    const mid = Math.floor(windowViews.length / 2);
    const median = windowViews.length % 2 === 0
      ? (windowViews[mid - 1] + windowViews[mid]) / 2
      : windowViews[mid];

    if (median > 0 && day.views > median * THRESHOLD) {
      const d = new Date(day.date);
      spikes.push({
        date: day.date,
        views: day.views,
        average: median,
        multiplier: day.views / median,
        period: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      });
    }
  }

  // Merge consecutive spike days — keep only the peak day from each cluster
  const merged: Spike[] = [];
  for (const spike of spikes) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const prevDate = new Date(prev.date).getTime();
      const curDate = new Date(spike.date).getTime();
      const daysDiff = (curDate - prevDate) / (1000 * 60 * 60 * 24);

      if (daysDiff <= 3) {
        // Same cluster — keep the higher spike
        if (spike.views > prev.views) {
          merged[merged.length - 1] = spike;
        }
        continue;
      }
    }
    merged.push(spike);
  }

  // Sort by multiplier descending (most dramatic spikes first)
  return merged.sort((a, b) => b.multiplier - a.multiplier);
}
