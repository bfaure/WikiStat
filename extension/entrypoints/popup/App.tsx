import { useState, useEffect } from "react";
import type { ArticleInfo, UserPreferences } from "../../lib/types";
import { getPreferences, setPreferences } from "../../lib/storage";

export default function App() {
  const [article, setArticle] = useState<ArticleInfo | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);

  useEffect(() => {
    chrome.storage.session.get("currentArticle", (result) => {
      if (result.currentArticle) setArticle(result.currentArticle);
    });
    getPreferences().then(setPrefs);
  }, []);

  const toggleAutoOpen = async () => {
    if (!prefs) return;
    const updated = await setPreferences({ autoOpenPanel: !prefs.autoOpenPanel });
    setPrefs(updated);
  };

  return (
    <div className="popup">
      <div className="popup-header">
        <span className="popup-logo">W</span>
        <h2>WikiStat</h2>
      </div>

      {article ? (
        <p className="popup-article">
          Viewing: <strong>{article.title}</strong>
        </p>
      ) : (
        <p className="popup-desc">
          Navigate to a Wikipedia article to see stats.
        </p>
      )}

      <p className="popup-hint">
        Look for the <strong>W</strong> tab on the right edge of any Wikipedia article.
      </p>

      {prefs && (
        <div className="popup-settings">
          <div className="popup-setting">
            <label htmlFor="autoOpen">Auto-open panel</label>
            <div className="popup-toggle">
              <input
                type="checkbox"
                id="autoOpen"
                checked={prefs.autoOpenPanel}
                onChange={toggleAutoOpen}
              />
              <span className="popup-toggle-slider" />
            </div>
          </div>
        </div>
      )}

      <style>{`
        .popup {
          width: 280px;
          padding: 16px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: var(--bg);
          color: var(--fg);
          --bg: #ffffff;
          --fg: #202122;
          --fg-muted: #666;
          --toggle-bg: #ccc;
          --toggle-active: #3366cc;
          --border: #e0e0e0;
        }
        @media (prefers-color-scheme: dark) {
          .popup {
            --bg: #101418;
            --fg: #eaecf0;
            --fg-muted: #a7d7cb;
            --toggle-bg: #444;
            --toggle-active: #6b9aff;
            --border: #2e3338;
          }
        }
        .popup-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .popup-header h2 {
          font-size: 16px;
          margin: 0;
          font-weight: 600;
        }
        .popup-logo {
          font-size: 18px;
          font-weight: 700;
        }
        .popup-desc, .popup-article {
          font-size: 13px;
          color: var(--fg-muted);
          margin: 0 0 8px;
          line-height: 1.4;
        }
        .popup-article strong {
          color: var(--fg);
        }
        .popup-hint {
          font-size: 11px;
          color: var(--fg-muted);
          margin: 0 0 12px;
          line-height: 1.4;
        }
        .popup-hint strong {
          display: inline-block;
          background: #3366cc;
          color: white;
          width: 18px;
          height: 18px;
          line-height: 18px;
          text-align: center;
          border-radius: 4px;
          font-size: 11px;
          vertical-align: middle;
        }
        .popup-settings {
          border-top: 1px solid var(--border);
          padding-top: 8px;
        }
        .popup-setting {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 0;
        }
        .popup-setting label {
          font-size: 12px;
          color: var(--fg-muted);
          cursor: pointer;
        }
        .popup-toggle {
          position: relative;
          width: 36px;
          height: 20px;
          flex-shrink: 0;
        }
        .popup-toggle input {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
          z-index: 1;
          margin: 0;
        }
        .popup-toggle-slider {
          position: absolute;
          inset: 0;
          background: var(--toggle-bg);
          border-radius: 10px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .popup-toggle-slider::before {
          content: "";
          position: absolute;
          width: 16px;
          height: 16px;
          left: 2px;
          top: 2px;
          background: white;
          border-radius: 50%;
          transition: transform 0.2s;
        }
        .popup-toggle input:checked + .popup-toggle-slider {
          background: var(--toggle-active);
        }
        .popup-toggle input:checked + .popup-toggle-slider::before {
          transform: translateX(16px);
        }
      `}</style>
    </div>
  );
}
