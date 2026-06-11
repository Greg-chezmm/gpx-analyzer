import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface State {
  error: Error | null;
}

interface Props extends React.PropsWithChildren {
  /** Interface de repli personnalisée. Si omis, affiche la carte d'erreur par défaut. */
  fallback?: React.ReactNode;
  /** Nom de la section affiché dans le message d'erreur pour identifier le composant fautif. */
  section?: string;
}

/**
 * Conteneur React qui intercepte les erreurs de rendu dans son arbre enfant
 * et affiche une interface de secours au lieu de planter l'application entière.
 */
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

  /** Réinitialise l'état d'erreur pour permettre un nouvel essai de rendu. */
  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    const sectionLabel = this.props.section ? ` — ${this.props.section}` : "";

    return (
      <div className="card" style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: "1rem", padding: "2rem", textAlign: "center",
        borderColor: "var(--color-hr)",
      }}>
        <AlertTriangle size={28} style={{ color: "var(--color-hr)", flexShrink: 0 }} />
        <div>
          <p style={{ fontWeight: 700, marginBottom: "0.4rem", color: "var(--text-primary)" }}>
            Erreur d'affichage{sectionLabel}
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
