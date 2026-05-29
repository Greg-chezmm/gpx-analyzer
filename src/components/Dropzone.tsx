import React, { useState, useRef } from "react";
import { UploadCloud, FileWarning, HelpCircle } from "lucide-react";

interface DropzoneProps {
  onActivityLoaded: (gpxText: string, fileName: string) => void;
  onLoadSample: () => void;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onActivityLoaded, onLoadSample }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const processFile = (file: File) => {
    if (!file) return;

    // Validate extension
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "gpx") {
      setError("Format invalide. Veuillez importer un fichier au format .gpx uniquement.");
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        onActivityLoaded(text, file.name);
      }
    };
    reader.onerror = () => {
      setError("Erreur lors de la lecture du fichier. Veuillez réessayer.");
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="animate-slide-up" style={{ maxWidth: "600px", margin: "4rem auto", width: "100%" }}>
      <div 
        className={`dropzone ${isDragActive ? "active" : ""}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
      >
        <input 
          ref={fileInputRef}
          type="file" 
          id="gpx-file-input"
          accept=".gpx" 
          onChange={handleChange}
          style={{ display: "none" }}
        />
        
        <div className="dropzone-icon">
          <UploadCloud size={32} />
        </div>

        <h2 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
          Analysez votre fichier GPX
        </h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", fontSize: "0.95rem" }}>
          Glissez et déposez votre fichier de parcours ici, ou cliquez pour parcourir votre ordinateur.
        </p>

        {error && (
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "0.5rem", 
            color: "var(--color-hr)", 
            backgroundColor: "var(--color-hr-light)", 
            padding: "0.75rem 1rem", 
            borderRadius: "var(--radius-sm)",
            fontSize: "0.9rem",
            marginBottom: "1.5rem",
            border: "1px solid rgba(225, 29, 72, 0.2)"
          }}>
            <FileWarning size={16} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "1rem" }}>
          <button 
            type="button" 
            className="btn btn-primary"
            onClick={handleButtonClick}
          >
            Sélectionner un fichier
          </button>
          
          <button 
            type="button" 
            className="btn btn-outline"
            onClick={onLoadSample}
          >
            <HelpCircle size={16} />
            Tester avec un exemple
          </button>
        </div>
      </div>

      <div style={{ 
        marginTop: "2rem", 
        textAlign: "center", 
        fontSize: "0.85rem", 
        color: "var(--text-tertiary)",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem"
      }}>
        <p>🔒 Vos données d'entraînement restent 100% privées. L'analyse est effectuée localement dans votre navigateur.</p>
        <p>Prend en charge les parcours simples, ainsi que les données cardio (Garmin/Strava/Wahoo).</p>
      </div>
    </div>
  );
};
