import type { TopEditor } from "../../../lib/types";

interface Props {
  editors: TopEditor[] | null;
  loading: boolean;
  lang: string;
}

export default function TopEditors({ editors, loading, lang }: Props) {
  if (loading) {
    return (
      <div className="section">
        <div className="section-title">Top Editors (recent)</div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ padding: "0.4em 0.6em" }}>
            <div className="skeleton skeleton-text" style={{ width: "65%" }} />
          </div>
        ))}
      </div>
    );
  }

  if (!editors || editors.length === 0) return null;

  return (
    <div className="section">
      <div className="section-title">Top Editors (recent)</div>
      <div className="top-editors-list">
        {editors.map((editor, i) => (
          <div key={editor.name} className="top-editor-item">
            <span className="top-editor-rank">{i + 1}</span>
            <a
              className="top-editor-name"
              href={`https://${lang}.wikipedia.org/wiki/User:${encodeURIComponent(editor.name)}`}
              target="_blank"
              rel="noopener"
            >
              {editor.name}
            </a>
            <span className="top-editor-count">
              {editor.editCount} edit{editor.editCount !== 1 ? "s" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
