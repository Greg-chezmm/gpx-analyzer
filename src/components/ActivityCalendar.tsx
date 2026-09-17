import React, { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import type { CloudHandle } from "../hooks/useFirebaseCloud";
import type { ActivityIndexEntry } from "../utils/driveStorage";
import { formatDuration } from "../utils/format";

interface Props {
  cloud: CloudHandle;
  onOpenActivity: (entry: ActivityIndexEntry) => Promise<void>;
}

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const TYPE_COLOR: Record<string, string> = { running: "#818cf8", cycling: "#34d399" };

/** Clé "YYYY-MM-DD" en heure locale — évite le décalage de fuseau horaire de toISOString(). */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Calendrier mensuel des activités sauvegardées — une pastille colorée par séance (course/vélo)
 * sur son jour, cliquable pour l'ouvrir directement. Résumé du mois (séances, distance, temps)
 * en pied de carte. N'affiche rien si aucune activité n'est sauvegardée dans le cloud.
 */
export const ActivityCalendar: React.FC<Props> = ({ cloud, onOpenActivity }) => {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [openingKey, setOpeningKey] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, ActivityIndexEntry[]>();
    for (const e of cloud.history) {
      const list = map.get(e.date);
      if (list) list.push(e); else map.set(e.date, [e]);
    }
    return map;
  }, [cloud.history]);

  if (cloud.status !== 'connected' || cloud.history.length === 0) return null;

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7; // décale pour démarrer la semaine un lundi
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dateKey(new Date());

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthEntries = cloud.history.filter(e => e.date.slice(0, 7) === monthPrefix);
  const monthDistance = monthEntries.reduce((s, e) => s + (e.distance ?? 0), 0);
  const monthDuration = monthEntries.reduce((s, e) => s + (e.duration ?? 0), 0);

  const handleOpen = async (entry: ActivityIndexEntry, entryKey: string) => {
    setOpeningKey(entryKey);
    try {
      await onOpenActivity(entry);
    } catch {
      alert("Impossible de charger cette activité.");
    } finally {
      setOpeningKey(null);
    }
  };

  return (
    <div className="card animate-slide-up">
      <div className="panel-header" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
        <h3 className="panel-title">
          <CalendarDays size={18} style={{ color: "#f59e0b" }} />
          <span>Calendrier</span>
        </h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", justifyContent: "center" }}>
          <button type="button" className="btn btn-outline" onClick={() => setCursor(new Date(year, month - 1, 1))}
            style={{ padding: "0.3rem 0.5rem" }} title="Mois précédent">
            <ChevronLeft size={15} />
          </button>
          <span style={{ fontSize: "0.85rem", fontWeight: 700, textAlign: "center" }}>
            {MONTHS[month]} {year}
          </span>
          <button type="button" className="btn btn-outline" onClick={() => setCursor(new Date(year, month + 1, 1))}
            style={{ padding: "0.3rem 0.5rem" }} title="Mois suivant">
            <ChevronRight size={15} />
          </button>
          <button type="button" className="btn btn-outline"
            onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }}
            style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem" }} title="Revenir au mois en cours">
            Aujourd'hui
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "3px", marginBottom: "0.3rem" }}>
        {WEEKDAYS.map(w => (
          <div key={w} style={{ textAlign: "center", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-tertiary)", padding: "0.2rem 0" }}>
            {w}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "3px" }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dayKey = dateKey(d);
          const entries = byDay.get(dayKey) ?? [];
          const isToday = dayKey === todayKey;
          return (
            <div key={i} style={{
              minWidth: 0, minHeight: "60px", borderRadius: "var(--radius-sm)",
              border: `1px solid ${isToday ? "var(--accent-primary)" : "var(--border-color)"}`,
              background: isToday ? "color-mix(in srgb, var(--accent-primary) 6%, transparent)" : "var(--bg-primary)",
              padding: "0.25rem", display: "flex", flexDirection: "column", gap: "0.2rem",
            }}>
              <span style={{ fontSize: "0.72rem", fontWeight: isToday ? 800 : 600, color: isToday ? "var(--accent-primary)" : "var(--text-tertiary)" }}>
                {d.getDate()}
              </span>
              {entries.slice(0, 3).map((e, idx) => {
                const entryKey = e.cloudId ?? `${dayKey}-${idx}`;
                const color = TYPE_COLOR[e.activityType] ?? "var(--text-tertiary)";
                const opening = openingKey === entryKey;
                return (
                  <button key={entryKey} type="button" onClick={() => handleOpen(e, entryKey)}
                    title={`${e.name} — ${(e.distance / 1000).toFixed(1)} km, ${formatDuration(e.duration)}`}
                    disabled={opening}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.25rem", width: "100%", minWidth: 0,
                      background: `${color}18`, border: `1px solid ${color}55`,
                      borderRadius: "4px", padding: "0.1rem 0.3rem",
                      fontSize: "0.62rem", fontWeight: 700, color,
                      cursor: "pointer", opacity: opening ? 0.5 : 1,
                    }}
                  >
                    {opening
                      ? <Loader2 size={9} style={{ flexShrink: 0, animation: "spin 0.8s linear infinite" }} />
                      : <span style={{ flexShrink: 0 }}>{e.activityType === "cycling" ? "🚴" : e.activityType === "running" ? "🏃" : "●"}</span>}
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                  </button>
                );
              })}
              {entries.length > 3 && (
                <span style={{ fontSize: "0.62rem", color: "var(--text-tertiary)" }}>+{entries.length - 3}</span>
              )}
            </div>
          );
        })}
      </div>

      {monthEntries.length > 0 && (
        <div style={{
          display: "flex", gap: "1.25rem", marginTop: "0.75rem", paddingTop: "0.6rem",
          borderTop: "1px solid var(--border-color)", fontSize: "0.8rem", color: "var(--text-secondary)", flexWrap: "wrap",
        }}>
          <span><strong style={{ color: "var(--text-primary)" }}>{monthEntries.length}</strong> séance{monthEntries.length > 1 ? "s" : ""}</span>
          <span><strong style={{ color: "var(--text-primary)" }}>{(monthDistance / 1000).toFixed(1)}</strong> km</span>
          <span><strong style={{ color: "var(--text-primary)" }}>{formatDuration(monthDuration)}</strong></span>
        </div>
      )}
    </div>
  );
};
