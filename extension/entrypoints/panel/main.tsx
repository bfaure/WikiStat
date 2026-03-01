import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./style.css";

// Apply theme from parent page (content script passes ?theme=dark|light)
const params = new URLSearchParams(window.location.search);
const theme = params.get("theme");
if (theme === "dark") {
  document.documentElement.setAttribute("data-theme", "dark");
}

// Listen for live theme changes from the content script
window.addEventListener("message", (e) => {
  if (e.data?.type === "WIKISTAT_THEME_CHANGE") {
    if (e.data.theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
