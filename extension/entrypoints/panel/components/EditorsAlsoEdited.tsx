import { useState, useRef } from "react";
import type { CoEditedArticle } from "../../../lib/types";
import { fetchEditorContributions } from "../../../lib/wikipedia-api";

interface Props {
  lang: string;
  slug: string;
}

export default function EditorsAlsoEdited({ lang, slug }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [articles, setArticles] = useState<CoEditedArticle[] | null>(null);
  const [editorsAnalyzed, setEditorsAnalyzed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const handleToggle = async () => {
    const willExpand = !expanded;
    setExpanded(willExpand);

    // Only fetch once
    if (willExpand && !fetchedRef.current) {
      fetchedRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchEditorContributions(lang, slug);
        setArticles(result.articles);
        setEditorsAnalyzed(result.editorsAnalyzed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
        fetchedRef.current = false; // allow retry
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="section">
      <button
        className="settings-header-btn"
        onClick={handleToggle}
        aria-expanded={expanded}
      >
        <span className="section-title">
          Editors Also Edited
        </span>
        <span
          className="settings-chevron"
          style={{ transform: expanded ? "rotate(90deg)" : "none" }}
        >
          &#x25B6;
        </span>
      </button>

      {expanded && (
        <div>
          {loading && (
            <div className="also-edited-list">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="also-edited-item">
                  <div className="skeleton skeleton-text" style={{ width: "70%" }} />
                </div>
              ))}
            </div>
          )}

          {error && (
            <div style={{ color: "var(--accent-red)", padding: "0.4em 0.6em" }}>{error}</div>
          )}

          {articles && articles.length === 0 && (
            <div style={{ color: "var(--text-muted)", padding: "0.4em 0.6em" }}>
              No co-edited articles found.
            </div>
          )}

          {articles && articles.length > 0 && (
            <>
              <div style={{ fontSize: "smaller", color: "var(--text-muted)", padding: "0.4em 0.6em 0" }}>
                Based on {editorsAnalyzed} recent editors
              </div>
              <div className="also-edited-list">
                {articles.map((article) => (
                  <div key={article.slug} className="also-edited-item">
                    <a
                      className="also-edited-title"
                      href={`https://${lang}.wikipedia.org/wiki/${encodeURIComponent(article.slug).replace(/%2F/g, "/")}`}
                      target="_blank"
                      rel="noopener"
                    >
                      {article.title}
                    </a>
                    <span className="also-edited-meta">
                      {article.editorCount} editor{article.editorCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
