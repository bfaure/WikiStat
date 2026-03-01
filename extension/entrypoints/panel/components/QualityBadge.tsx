import type { QualityClass } from "../../../lib/types";

interface Props {
  qualityClass: QualityClass;
}

const QUALITY_INFO: Record<QualityClass, { label: string; cssClass: string; description: string }> = {
  FA: {
    label: "Featured Article",
    cssClass: "badge-fa",
    description: "This is one of Wikipedia's best articles, meeting the highest standards of quality.",
  },
  GA: {
    label: "Good Article",
    cssClass: "badge-ga",
    description: "This article meets the good article criteria, with reliable sources and broad coverage.",
  },
  B: {
    label: "B-Class",
    cssClass: "badge-b",
    description: "This article is mostly complete and has few content issues, but needs some work.",
  },
  C: {
    label: "C-Class",
    cssClass: "badge-c",
    description: "This article has substantial content but is still missing important information.",
  },
  Start: {
    label: "Start-Class",
    cssClass: "badge-start",
    description: "This article is developing but still quite incomplete.",
  },
  Stub: {
    label: "Stub",
    cssClass: "badge-stub",
    description: "This article provides very basic information and needs significant expansion.",
  },
};

export default function QualityBadge({ qualityClass }: Props) {
  const info = QUALITY_INFO[qualityClass];
  if (!info) return null;

  return (
    <div className="section">
      <div className="section-title">Article Quality</div>
      <span className={`badge ${info.cssClass}`} title={info.description}>
        {info.label}
      </span>
      <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>
        {info.description}
      </p>
    </div>
  );
}
