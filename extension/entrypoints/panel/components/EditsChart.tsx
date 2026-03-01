import { useState, useCallback, useRef, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import type { EditDay } from "../../../lib/types";
import { fetchRevisions, fetchRevisionDiff, type RevisionEntry } from "../../../lib/wikipedia-api";

interface Props {
  editHistory: EditDay[] | null;
  loading: boolean;
  rangeDays: number;
  lang: string;
  slug: string;
  height?: number;
  onHeightChange?: (height: number) => void;
}

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 400;

interface ChartBar {
  label: string;
  edits: number;
  startDate: string;
  endDate: string;
}

export default function EditsChart({ editHistory, loading, rangeDays, lang, slug, height = 140, onHeightChange }: Props) {
  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  const [revisions, setRevisions] = useState<RevisionEntry[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [localHeight, setLocalHeight] = useState(height);
  useEffect(() => { setLocalHeight(height); }, [height]);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: localHeight };
    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientY - dragRef.current.startY;
      const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragRef.current.startH + delta));
      setLocalHeight(next);
    };
    const onMouseUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      if (dragRef.current) {
        const delta = ev.clientY - dragRef.current.startY;
        const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragRef.current.startH + delta));
        onHeightChange?.(next);
      }
      dragRef.current = null;
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [localHeight, onHeightChange]);

  const handleBarClick = useCallback(async (idx: number, bar: ChartBar) => {
    if (selectedBar === idx) {
      setSelectedBar(null);
      setRevisions([]);
      return;
    }

    setSelectedBar(idx);
    setRevisionsLoading(true);
    setRevisions([]);
    try {
      const revs = await fetchRevisions(lang, slug, bar.startDate, bar.endDate);
      setRevisions(revs);
    } catch {
      setRevisions([]);
    } finally {
      setRevisionsLoading(false);
    }
  }, [selectedBar, lang, slug]);

  if (loading) {
    return (
      <div className="section">
        <div className="section-title">Edit Activity</div>
        <div style={{ padding: "0.4em" }}><div className="skeleton skeleton-chart" /></div>
      </div>
    );
  }

  if (!editHistory || editHistory.length === 0) return null;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - rangeDays);
  const cutoff = cutoffDate.toISOString().slice(0, 10);
  const filtered = editHistory.filter((d) => d.date >= cutoff);
  if (filtered.length === 0) return null;

  let chartData: ChartBar[];
  if (rangeDays <= 30) {
    chartData = filtered.map((d) => ({
      label: formatDay(d.date),
      edits: d.edits,
      startDate: d.date,
      endDate: d.date,
    }));
  } else if (rangeDays <= 365) {
    chartData = aggregateWeeks(filtered);
  } else {
    chartData = aggregateMonths(filtered);
  }

  if (chartData.length === 0) return null;

  const selectedData = selectedBar !== null ? chartData[selectedBar] : null;

  return (
    <div className="section">
      <div className="section-title">
        Edit Activity
        <span style={{ fontSize: 10, fontWeight: 400, color: "var(--text-muted)", marginLeft: 6, textTransform: "none" }}>
          click a bar for details
        </span>
      </div>
      <div className="chart-container" style={{ height: localHeight, cursor: "pointer" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
            onClick={(state) => {
              if (state?.activeTooltipIndex != null) {
                const idx = state.activeTooltipIndex;
                handleBarClick(idx, chartData[idx]);
              }
            }}
          >
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickLine={false}
              axisLine={false}
              interval={Math.max(0, Math.floor(chartData.length / 5) - 1)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: 2,
                fontSize: 12,
              }}
              formatter={(value: number) => [value.toLocaleString(), "Edits"]}
              labelFormatter={(label: string) => label}
            />
            <Bar dataKey="edits" radius={[2, 2, 0, 0]} maxBarSize={20}>
              {chartData.map((_, i) => (
                <Cell
                  key={i}
                  fill={i === selectedBar ? "var(--accent-blue)" : "var(--accent-green)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="resize-handle" onMouseDown={onResizeMouseDown} />

      {selectedBar !== null && selectedData && (
        <div className="edit-preview">
          <div className="edit-preview-header">
            <span className="edit-preview-title">
              {selectedData.startDate === selectedData.endDate
                ? formatDay(selectedData.startDate)
                : `${formatDay(selectedData.startDate)} — ${formatDay(selectedData.endDate)}`}
            </span>
            <span className="edit-preview-count">
              {selectedData.edits} edit{selectedData.edits !== 1 ? "s" : ""}
            </span>
            <button
              className="edit-preview-close"
              onClick={() => { setSelectedBar(null); setRevisions([]); }}
              title="Close"
            >
              {"\u2715"}
            </button>
          </div>

          {revisionsLoading ? (
            <div style={{ padding: "8px 0" }}>
              <div className="skeleton skeleton-text" style={{ width: "90%" }} />
              <div className="skeleton skeleton-text" style={{ width: "70%" }} />
              <div className="skeleton skeleton-text" style={{ width: "80%" }} />
            </div>
          ) : revisions.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>
              No revision details available.
            </p>
          ) : (
            <div className="edit-preview-list">
              {revisions.map((rev) => (
                <RevisionRow key={rev.revid} rev={rev} lang={lang} />
              ))}
              {revisions.length >= 50 && (
                <p style={{ fontSize: 11, color: "var(--text-muted)", padding: "4px 0" }}>
                  Showing first 50 revisions.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RevisionRow({ rev, lang }: { rev: RevisionEntry; lang: string }) {
  const [expanded, setExpanded] = useState(false);
  const [diffHtml, setDiffHtml] = useState<string | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const toggleDiff = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (diffHtml !== null) return; // already loaded

    setDiffLoading(true);
    try {
      const html = await fetchRevisionDiff(lang, rev.revid);
      setDiffHtml(html);
    } catch {
      setDiffHtml("");
    } finally {
      setDiffLoading(false);
    }
  };

  return (
    <div className="edit-preview-item">
      <button className="edit-row-toggle" onClick={toggleDiff}>
        <span className="edit-row-chevron" style={{ transform: expanded ? "rotate(90deg)" : "none" }}>
          {"\u25B6"}
        </span>
        <div className="edit-preview-meta">
          <a
            className="edit-preview-user"
            href={`https://${lang}.wikipedia.org/wiki/User:${encodeURIComponent(rev.user)}`}
            target="_blank"
            rel="noopener"
            onClick={(e) => e.stopPropagation()}
          >
            {rev.user}
          </a>
          <span className="edit-preview-time">
            {new Date(rev.timestamp).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          <span className={`edit-preview-diff ${rev.sizeDiff > 0 ? "diff-add" : rev.sizeDiff < 0 ? "diff-remove" : ""}`}>
            {rev.sizeDiff > 0 ? "+" : ""}{rev.sizeDiff.toLocaleString()}
          </span>
        </div>
      </button>
      <div className="edit-preview-comment" onClick={toggleDiff} style={{ cursor: "pointer" }}>
        {rev.comment}
      </div>

      {expanded && (
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
            href={`https://${lang}.wikipedia.org/w/index.php?diff=${rev.revid}`}
            target="_blank"
            rel="noopener"
          >
            View full diff on Wikipedia
          </a>
        </div>
      )}
    </div>
  );
}

function formatDay(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function aggregateWeeks(days: EditDay[]): ChartBar[] {
  const result: ChartBar[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const week = days.slice(i, i + 7);
    const totalEdits = week.reduce((s, d) => s + d.edits, 0);
    const midDate = week[Math.floor(week.length / 2)].date;
    const d = new Date(midDate);
    result.push({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      edits: totalEdits,
      startDate: week[0].date,
      endDate: week[week.length - 1].date,
    });
  }
  return result;
}

function aggregateMonths(days: EditDay[]): ChartBar[] {
  const monthMap = new Map<string, { edits: number; startDate: string; endDate: string }>();
  for (const d of days) {
    const month = d.date.slice(0, 7);
    const existing = monthMap.get(month);
    if (existing) {
      existing.edits += d.edits;
      if (d.date < existing.startDate) existing.startDate = d.date;
      if (d.date > existing.endDate) existing.endDate = d.date;
    } else {
      monthMap.set(month, { edits: d.edits, startDate: d.date, endDate: d.date });
    }
  }
  return Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, data]) => {
      const d = new Date(month + "-01");
      return {
        label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        edits: data.edits,
        startDate: data.startDate,
        endDate: data.endDate,
      };
    });
}
