import { useState, useRef, useCallback, useEffect } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceDot,
} from "recharts";
import type { PageviewDay } from "../../../lib/types";

export const VIEW_RANGES = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
  { label: "2y", days: 730 },
] as const;

interface ChartPoint {
  idx: number;
  views: number;
  label: string;
  isSpike: boolean;
}

interface Props {
  pageviews: PageviewDay[];
  loading: boolean;
  spikeDates?: Set<string>;
  rangeDays: number;
  onRangeChange: (days: number) => void;
  height?: number;
  onHeightChange?: (height: number) => void;
}

const MIN_HEIGHT = 80;
const MAX_HEIGHT = 400;

export default function ViewsChart({ pageviews, loading, spikeDates, rangeDays, onRangeChange, height = 140, onHeightChange }: Props) {
  const [localHeight, setLocalHeight] = useState(height);
  useEffect(() => { setLocalHeight(height); }, [height]);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
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
  if (loading) {
    return (
      <div className="section">
        <div className="section-title">Pageviews</div>
        <div style={{ padding: "0.4em" }}><div className="skeleton skeleton-chart" /></div>
      </div>
    );
  }

  if (pageviews.length === 0) return null;

  const sliced = pageviews.slice(-rangeDays);
  const spikeSet = spikeDates ?? new Set<string>();

  // For longer ranges, aggregate to weekly to keep chart readable
  let chartData: ChartPoint[];
  if (rangeDays > 365) {
    chartData = aggregateWeekly(sliced, rangeDays, spikeSet);
  } else {
    chartData = sliced.map((d, i) => ({
      idx: i,
      views: d.views,
      label: formatDate(d.date, rangeDays),
      isSpike: spikeSet.has(d.date),
    }));
  }

  const spikePoints = chartData.filter((d) => d.isSpike);

  return (
    <div className="section">
      <div className="chart-header">
        <div className="section-title">Pageviews</div>
        <div className="chart-range-btns">
          {VIEW_RANGES.map((r) => (
            <button
              key={r.days}
              className={`chart-range-btn ${rangeDays === r.days ? "active" : ""}`}
              onClick={() => onRangeChange(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-container" style={{ height: localHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="idx"
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickLine={false}
              axisLine={false}
              interval={Math.floor(chartData.length / 4)}
              tickFormatter={(idx: number) => chartData[idx]?.label ?? ""}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={shortNumber}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: 2,
                fontSize: 12,
              }}
              formatter={(value: number) => [value.toLocaleString(), "Views"]}
              labelFormatter={(idx: number) => chartData[idx]?.label ?? ""}
            />
            <Area
              type="monotone"
              dataKey="views"
              stroke="var(--accent-blue)"
              strokeWidth={2}
              fill="url(#viewsGradient)"
            />
            {spikePoints.map((sp) => (
              <ReferenceDot
                key={`spike-${sp.idx}`}
                x={sp.idx}
                y={sp.views}
                r={4}
                fill="var(--accent-orange)"
                stroke="var(--bg-primary)"
                strokeWidth={2}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="resize-handle" onMouseDown={onMouseDown} />
    </div>
  );
}

function formatDate(dateStr: string, rangeDays: number): string {
  const d = new Date(dateStr);
  if (rangeDays > 180) {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function shortNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return String(n);
}

/** Aggregate daily data into weekly averages, preserving spike info */
function aggregateWeekly(
  days: Array<{ date: string; views: number }>,
  rangeDays: number,
  spikeDates: Set<string>,
): ChartPoint[] {
  const result: ChartPoint[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const week = days.slice(i, i + 7);
    const avgViews = Math.round(week.reduce((s, d) => s + d.views, 0) / week.length);
    const midDate = week[Math.floor(week.length / 2)].date;
    // Mark as spike if ANY day in this week is a spike
    const hasSpike = week.some((d) => spikeDates.has(d.date));
    result.push({
      idx: result.length,
      views: avgViews,
      label: formatDate(midDate, rangeDays),
      isSpike: hasSpike,
    });
  }
  return result;
}
