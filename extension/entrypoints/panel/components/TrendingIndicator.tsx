interface Props {
  rank: number;
  views: number | null;
}

export default function TrendingIndicator({ rank, views }: Props) {
  return (
    <div className="section">
      <div className="trending">
        <span>&#x25B2;</span>
        <span>#{rank} trending today</span>
      </div>
      {views != null && (
        <div style={{ fontSize: "inherit", color: "var(--text-muted)", textAlign: "center", padding: "0 0.6em 0.4em" }}>
          {views.toLocaleString()} views today
        </div>
      )}
    </div>
  );
}
