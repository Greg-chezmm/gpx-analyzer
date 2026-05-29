import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface State {
  error: Error | null;
}

interface Props extends React.PropsWithChildren {
  /** Optional custom fallback UI. If omitted, shows the default error card. */
  fallback?: React.ReactNode;
  /** Label shown in the error card to identify which section crashed. */
  section?: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[GPX Analyzer] Erreur composant :", error.message, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    const section = this.props.section ? ` — ${this.props.section}` : "";

    return (
      <div className="card" style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: "1rem", padding: "2rem", textAlign: "center",
        borderColor: "var(--color-hr)",
      }}>
        <AlertTriangle size={28} style={{ color: "var(--color-hr)", flexShrink: 0 }} />
        <div>
          <p style={{ fontWeight: 700, marginBottom: "0.4rem", color: "var(--text-primary)" }}>
            Erreur d'affichage{section}
          </p>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", maxWidth: "400px" }}>
            {error.message}
          </p>
        </div>
        <button className="btn btn-outline" onClick={this.reset}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
          <RefreshCw size={14} />
          Réessayer
        </button>
      </div>
    );
  }
}
