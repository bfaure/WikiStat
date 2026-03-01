import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[WikiStat] UI error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
          <div style={{ textAlign: "center", padding: "32px 16px" }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>W</p>
            <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
              Something went wrong. Please try again.
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              style={{
                padding: "8px 16px",
                background: "var(--accent-blue, #3366cc)",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
