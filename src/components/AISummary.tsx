import React, { useState, useRef, useEffect } from "react";
import { X, Copy, Check, ExternalLink, Sparkles } from "lucide-react";

interface AISummaryProps {
  text: string;
  onClose: () => void;
}

export const AISummaryModal: React.FC<AISummaryProps> = ({ text, onClose }) => {
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleCopy = async () => {
    const val = textareaRef.current?.value ?? text;
    await navigator.clipboard.writeText(val);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-lg)",
        width: "min(720px, 100%)",
        maxHeight: "90vh",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 25px 50px rgba(0,0,0,0.35)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.75rem",
          padding: "1rem 1.25rem",
          borderBottom: "1px solid var(--border-color)",
        }}>
          <Sparkles size={18} style={{ color: "var(--accent-primary)", flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>
              Résumé prêt pour l'IA
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
              Modifie le texte si besoin, puis copie-le dans Claude.ai, ChatGPT ou Gemini
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-tertiary)", padding: "0.25rem",
            display: "flex", alignItems: "center", borderRadius: "var(--radius-sm)",
          }}>
            <X size={18} />
          </button>
        </div>

        {/* Textarea */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: "1rem 1.25rem" }}>
          <textarea
            ref={textareaRef}
            defaultValue={text}
            style={{
              flex: 1,
              width: "100%",
              minHeight: "380px",
              resize: "vertical",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "0.8rem",
              lineHeight: 1.6,
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-md)",
              padding: "0.85rem 1rem",
              outline: "none",
            }}
          />
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap",
          padding: "0.85rem 1.25rem",
          borderTop: "1px solid var(--border-color)",
        }}>
          <button
            onClick={handleCopy}
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              padding: "0.55rem 1.1rem",
              borderRadius: "var(--radius-md)",
              border: "none", cursor: "pointer", fontWeight: 600, fontSize: "0.88rem",
              background: copied ? "#22c55e" : "var(--accent-primary)",
              color: "#fff",
              transition: "background 0.2s",
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copié !" : "Copier"}
          </button>

          <a
            href="https://claude.ai"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              padding: "0.55rem 1.1rem",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-color)",
              textDecoration: "none", fontWeight: 600, fontSize: "0.88rem",
              color: "var(--text-primary)",
              background: "var(--bg-primary)",
            }}
          >
            <ExternalLink size={14} />
            Ouvrir Claude.ai
          </a>

          <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginLeft: "auto" }}>
            Copie d'abord, puis colle dans la conversation
          </span>
        </div>
      </div>
    </div>
  );
};
