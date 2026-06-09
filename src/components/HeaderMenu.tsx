import { useState, useEffect, useRef } from 'react';
import { Menu, Settings, Sun, Moon, Download, GitMerge, Trash2 } from 'lucide-react';

interface HeaderMenuProps {
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  // activity-specific (undefined when no activity loaded)
  hasActivity?: boolean;
  onExportGPX?: () => void;
  onMerge?: () => void;
  onReset?: () => void;
}

export function HeaderMenu({
  isDark, onToggleTheme, onOpenSettings,
  hasActivity, onExportGPX, onMerge, onReset,
}: HeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    const onDown = (e: MouseEvent) => {
      if (
        !panelRef.current?.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-outline"
        onClick={() => setOpen(v => !v)}
        title="Menu"
        aria-expanded={open}
        style={{ padding: '0.5rem 0.75rem', fontSize: '0.9rem' }}
      >
        <Menu size={16} />
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: pos.top,
            right: pos.right,
            zIndex: 2100,
            minWidth: '210px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-xl)',
            padding: '0.35rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.1rem',
          }}
        >
          {/* Profil & thème — toujours visibles */}
          <MenuItem
            icon={<Settings size={15} />}
            label="Profil athlète"
            onClick={() => { onOpenSettings(); close(); }}
          />
          <MenuItem
            icon={isDark ? <Sun size={15} /> : <Moon size={15} />}
            label={isDark ? 'Mode clair' : 'Mode sombre'}
            onClick={() => { onToggleTheme(); close(); }}
          />

          {/* Actions activité */}
          {hasActivity && (
            <>
              <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.25rem 0.5rem' }} />
              <MenuItem
                icon={<Download size={15} />}
                label="Exporter GPX"
                onClick={() => { onExportGPX?.(); close(); }}
              />
              <MenuItem
                icon={<GitMerge size={15} />}
                label="Ajouter un segment"
                onClick={() => { onMerge?.(); close(); }}
              />
              <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.25rem 0.5rem' }} />
              <MenuItem
                icon={<Trash2 size={15} />}
                label="Fermer le fichier"
                onClick={() => { onReset?.(); close(); }}
                danger
              />
            </>
          )}
        </div>
      )}
    </>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

function MenuItem({ icon, label, onClick, disabled, danger }: MenuItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.65rem',
        padding: '0.55rem 0.75rem',
        background: 'transparent', border: 'none',
        borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'default' : 'pointer',
        color: danger ? 'var(--color-hr)' : 'var(--text-primary)',
        fontSize: '0.88rem', fontWeight: 500,
        opacity: disabled ? 0.45 : 1,
        width: '100%', textAlign: 'left',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.background = danger
            ? 'rgba(225,29,72,0.08)'
            : 'rgba(128,128,128,0.1)';
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {icon}
      {label}
    </button>
  );
}
