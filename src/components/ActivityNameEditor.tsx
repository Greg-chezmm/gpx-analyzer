import { useState, useEffect, useRef } from 'react';
import { Pencil, Check, X, MapPin, Calendar, Loader2 } from 'lucide-react';

interface Props {
  name: string;
  location: string | null;
  locationLoading: boolean;
  date: Date | null;
  onSave: (newName: string) => void;
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

export function ActivityNameEditor({ name, location, locationLoading, date, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset draft when name changes from outside (new activity loaded)
  useEffect(() => {
    setDraft(name);
    setEditing(false);
  }, [name]);

  const startEdit = () => {
    setDraft(name);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onSave(trimmed);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(name);
    setEditing(false);
  };

  const insertChip = (text: string) => {
    const sep = draft.trim() ? ' · ' : '';
    setDraft(prev => prev.trim() + sep + text);
    inputRef.current?.focus();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') cancel();
  };

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <h2 className="activity-title">{name}</h2>
        <button
          type="button"
          onClick={startEdit}
          title="Renommer la séance"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem',
            color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center',
            borderRadius: 'var(--radius-sm)', transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          <Pencil size={14} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, minWidth: 0, width: '100%' }}>
      {/* Input + action buttons */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: '0.4rem', width: '100%' }}>
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKey}
          style={{
            flex: 1, padding: '0.5rem 0.65rem',
            fontSize: '1rem', fontWeight: 700, /* 16px — évite le zoom automatique iOS */
            fontFamily: 'var(--font-heading)',
            background: 'var(--bg-primary)', color: 'var(--text-primary)',
            border: '1.5px solid var(--accent-primary)',
            borderRadius: 'var(--radius-sm)', outline: 'none',
            minWidth: 0,
          }}
        />
        <button type="button" onClick={save} title="Valider (Entrée)"
          style={{
            padding: '0.5rem 0.65rem', borderRadius: 'var(--radius-sm)',
            background: 'var(--accent-primary)', border: 'none',
            color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <Check size={16} />
        </button>
        <button type="button" onClick={cancel} title="Annuler (Échap)"
          style={{
            padding: '0.5rem 0.65rem', borderRadius: 'var(--radius-sm)',
            background: 'transparent', border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Chips — insertion rapide lieu / date */}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>Insérer :</span>

        {locationLoading ? (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Loader2 size={11} style={{ animation: 'spin 0.8s linear infinite' }} />
            Localisation…
          </span>
        ) : location ? (
          <button type="button" onClick={() => insertChip(location)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.3rem 0.7rem', fontSize: '0.78rem',
              background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-primary) 35%, transparent)',
              color: 'var(--accent-primary)', borderRadius: 'var(--radius-full)',
              cursor: 'pointer', fontWeight: 600, touchAction: 'manipulation',
            }}
          >
            <MapPin size={12} />
            {location}
          </button>
        ) : null}

        {date && (
          <button type="button" onClick={() => insertChip(fmtDate(date))}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.3rem 0.7rem', fontSize: '0.78rem',
              background: 'color-mix(in srgb, var(--accent-secondary) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-secondary) 35%, transparent)',
              color: 'var(--accent-secondary)', borderRadius: 'var(--radius-full)',
              cursor: 'pointer', fontWeight: 600, touchAction: 'manipulation',
            }}
          >
            <Calendar size={12} />
            {fmtDate(date)}
          </button>
        )}

        {location && date && (
          <button type="button"
            onClick={() => {
              const sep = draft.trim() ? ' · ' : '';
              setDraft(prev => prev.trim() + sep + location + ' · ' + fmtDate(date));
              inputRef.current?.focus();
            }}
            style={{
              padding: '0.3rem 0.7rem', fontSize: '0.78rem',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)', borderRadius: 'var(--radius-full)',
              cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            Les deux
          </button>
        )}
      </div>
    </div>
  );
}
