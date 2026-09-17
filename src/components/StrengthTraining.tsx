import { useState, useEffect, type ReactNode } from "react";
import { X, Dumbbell, ChevronDown, Play, Pause, ListChecks, Timer } from "lucide-react";

type Category = 'post' | 'quad' | 'stab' | 'chev' | 'tronc' | 'plio';
type Filter = Category | 'all' | 'intact';

/** Une étape de la décomposition du mouvement — 4 par exercice (ex. départ/descente/bas/remontée). */
interface ExerciseFrame {
  svg: ReactNode;
  label: string;
}

interface Exercise {
  name: string;
  category: Category;
  material: string;
  intact?: boolean;
  prescription: string;
  steps: string[];
  warning?: string;
  youtubeQuery: string;
  svgLabel: string;
  /** Angle de vue du schéma — affiché sous le diagramme pour lever toute ambiguïté (le dessin lui-même
   * est aussi redessiné pour se lire sans le label : profil + "nez" directionnel pour 'côté', tête avec
   * yeux + épaules larges pour 'face', schéma abstrait sans silhouette pour 'dessus'). */
  view: 'face' | 'côté' | 'dessus';
  /** Décomposition du mouvement en 4 poses (chacune un <svg viewBox="0 0 60 100"> autoporteur),
   * lues en boucle par PoseAnimator (bouton lecture) pour visualiser l'enchaînement. */
  frames: [ExerciseFrame, ExerciseFrame, ExerciseFrame, ExerciseFrame];
}

const VIEW_LABELS: Record<Exercise['view'], string> = {
  'côté': 'Vue de côté',
  'face': 'Vue de face',
  'dessus': 'Vue de dessus (schéma)',
};

const FRAME_INTERVAL_MS = 700;

interface PoseAnimatorProps {
  frames: Exercise['frames'];
  svgLabel: string;
  view: Exercise['view'];
  /** Taille du cadre carré en px — la vue liste et le lecteur de séance utilisent des tailles différentes. */
  size?: number;
}

/**
 * Rejoue la décomposition en 4 poses d'un exercice — en pause sur la 1ère pose par défaut (pas
 * d'animation imposée à l'écran), bouton Lire/Pause pour boucler, points cliquables pour naviguer
 * manuellement pose par pose.
 */
function PoseAnimator({ frames, svgLabel, view, size = 170 }: PoseAnimatorProps) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setCurrent(c => (c + 1) % frames.length), FRAME_INTERVAL_MS);
    return () => clearInterval(t);
  }, [playing, frames.length]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        {frames.map((f, i) => (
          <div key={i} aria-hidden={i !== current} style={{
            position: 'absolute', inset: 0,
            opacity: i === current ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}>
            {f.svg}
          </div>
        ))}
      </div>

      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', minHeight: '1.2em' }}>
        {frames[current].label}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button type="button" onClick={() => setPlaying(p => !p)} aria-label={playing ? 'Mettre en pause' : "Lire l'animation"}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.6rem', borderRadius: 999,
            border: '1px solid var(--accent-primary)', background: playing ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'transparent',
            color: 'var(--accent-primary)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer',
          }}>
          {playing ? <Pause size={11} /> : <Play size={11} />}
          {playing ? 'Pause' : 'Lire'}
        </button>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {frames.map((_, i) => (
            <button key={i} type="button" onClick={() => { setCurrent(i); setPlaying(false); }}
              aria-label={`Pose ${i + 1}/${frames.length}`}
              style={{
                width: 7, height: 7, borderRadius: '50%', padding: 0, cursor: 'pointer',
                border: 'none', background: i === current ? 'var(--accent-primary)' : 'var(--border-color)',
              }} />
          ))}
        </div>
      </div>

      <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>{svgLabel}</div>
      <span style={{
        fontSize: '0.6rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.3px',
        background: 'color-mix(in srgb, var(--text-tertiary) 12%, transparent)', color: 'var(--text-secondary)',
      }}>
        {VIEW_LABELS[view]}
      </span>
    </div>
  );
}

const CATEGORY_LABELS: Record<Category, string> = {
  post: 'Chaîne post.',
  quad: 'Quadriceps',
  stab: 'Stabilité',
  chev: 'Chevilles',
  tronc: 'Tronc',
  plio: 'Pliométrie',
};

const CATEGORY_COLORS: Record<Category, string> = {
  post: '#3B82F6',
  quad: '#F59E0B',
  stab: '#A78BFA',
  chev: '#FB923C',
  tronc: '#06B6D4',
  plio: '#F43F5E',
};

const ACCENT = '#4ADE80';

const EXERCISES: Exercise[] = [
  {
    name: 'Romanian Deadlift', category: 'post', material: 'KB 12kg', intact: true,
    prescription: '3 × 12 — 2 séries gauche / 1 droite',
    steps: [
      "Debout, KB dans la main, pieds à largeur de hanches",
      "Charnière de hanche : pousse les fesses vers l'arrière, dos plat",
      "Descente KB le long de la jambe — arrêt à l'étirement ischio",
      "Remontée en contractant les fessiers — ne pas verrouiller les genoux",
      "Tempo : 2 sec descente / 1 sec haut",
    ],
    warning: 'Gainage abdominal actif pendant tout le mouvement',
    youtubeQuery: 'romanian deadlift kettlebell technique',
    svgLabel: 'Charnière de hanche — dos plat',
    view: 'côté',
    frames: [
      {
        label: 'Départ — debout, buste droit',
        svg: (
          <svg viewBox="0 0 90 100" width="100%" height="100%">
            <line x1="3" y1="90" x2="87" y2="90" stroke="#2E3840" strokeWidth="1" />
            {/* Canvas élargi (0-90) pour laisser la place à un vrai buste ~horizontal en bas du mouvement.
                La hanche (58,46, point orange) et les pieds (48/62,88) sont FIXES sur les 4 poses — seuls
                le buste, la tête et le bras/KB pivotent autour de la hanche, comme un vrai hip hinge. */}
            <circle cx="52" cy="12" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="46,9.5 46,14.5 39,12" fill={ACCENT} />
            <line x1="58" y1="18" x2="55" y2="15" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="58" cy="18" r="2.2" fill="#8A9BA8" />
            <line x1="58" y1="18" x2="58" y2="46" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="58" cy="46" r="2.6" fill="#F59E0B" />
            <line x1="58" y1="18" x2="55" y2="32" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="55" cy="32" r="2" fill="#8A9BA8" />
            <line x1="55" y1="32" x2="53" y2="51" stroke={ACCENT} strokeWidth="2" />
            <rect x="49" y="51" width="8" height="7" rx="1.5" fill={ACCENT} opacity="0.7" />
            <line x1="58" y1="46" x2="54" y2="67" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="54" cy="67" r="2.2" fill="#8A9BA8" />
            <line x1="54" y1="67" x2="48" y2="88" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="58" y1="46" x2="59" y2="67" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="59" cy="67" r="2.2" fill="#8A9BA8" />
            <line x1="59" y1="67" x2="62" y2="88" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Descente — le buste bascule en avant, hanche fixe',
        svg: (
          <svg viewBox="0 0 90 100" width="100%" height="100%">
            <line x1="3" y1="90" x2="87" y2="90" stroke="#2E3840" strokeWidth="1" />
            <circle cx="36" cy="17" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="30,14.5 30,19.5 23,17" fill={ACCENT} />
            <line x1="42" y1="23" x2="39" y2="20" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="42" cy="23" r="2.2" fill="#8A9BA8" />
            <line x1="42" y1="23" x2="58" y2="46" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="58" cy="46" r="2.6" fill="#F59E0B" />
            <line x1="42" y1="23" x2="39" y2="37" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="39" cy="37" r="2" fill="#8A9BA8" />
            <line x1="39" y1="37" x2="37" y2="55" stroke={ACCENT} strokeWidth="2" />
            <rect x="33" y="55" width="8" height="7" rx="1.5" fill={ACCENT} opacity="0.7" />
            <line x1="58" y1="46" x2="52" y2="67" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="52" cy="67" r="2.2" fill="#8A9BA8" />
            <line x1="52" y1="67" x2="48" y2="88" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="58" y1="46" x2="60" y2="67" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="60" cy="67" r="2.2" fill="#8A9BA8" />
            <line x1="60" y1="67" x2="62" y2="88" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Bas — buste ~parallèle au sol, hanche toujours au même endroit',
        svg: (
          <svg viewBox="0 0 90 100" width="100%" height="100%">
            <line x1="3" y1="90" x2="87" y2="90" stroke="#2E3840" strokeWidth="1" />
            <circle cx="27" cy="27" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="21,24.5 21,29.5 14,27" fill={ACCENT} />
            <line x1="33" y1="34" x2="30" y2="31" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="33" cy="34" r="2.2" fill="#8A9BA8" />
            {/* La hanche EST le pivot — elle ne bouge pas d'une pose à l'autre, c'est le buste qui pivote autour. */}
            <line x1="33" y1="34" x2="58" y2="46" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="58" cy="46" r="2.6" fill="#F59E0B" />
            <line x1="33" y1="34" x2="30" y2="47" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="47" r="2" fill="#8A9BA8" />
            <line x1="30" y1="47" x2="28" y2="65" stroke={ACCENT} strokeWidth="2" />
            <rect x="24" y="65" width="8" height="7" rx="1.5" fill={ACCENT} opacity="0.7" />
            <line x1="58" y1="46" x2="50" y2="67" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="50" cy="67" r="2.2" fill="#8A9BA8" />
            <line x1="50" y1="67" x2="48" y2="88" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="58" y1="46" x2="61" y2="67" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="61" cy="67" r="2.2" fill="#8A9BA8" />
            <line x1="61" y1="67" x2="62" y2="88" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Remontée — pousse dans les talons, fessiers',
        svg: (
          <svg viewBox="0 0 90 100" width="100%" height="100%">
            <line x1="3" y1="90" x2="87" y2="90" stroke="#2E3840" strokeWidth="1" />
            <circle cx="36" cy="17" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="30,14.5 30,19.5 23,17" fill={ACCENT} />
            <line x1="42" y1="23" x2="39" y2="20" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="42" cy="23" r="2.2" fill="#8A9BA8" />
            <line x1="42" y1="23" x2="58" y2="46" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="58" cy="46" r="2.6" fill="#F59E0B" />
            <line x1="42" y1="23" x2="39" y2="37" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="39" cy="37" r="2" fill="#8A9BA8" />
            <line x1="39" y1="37" x2="37" y2="55" stroke={ACCENT} strokeWidth="2" />
            <rect x="33" y="55" width="8" height="7" rx="1.5" fill={ACCENT} opacity="0.7" />
            <line x1="58" y1="46" x2="52" y2="67" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="52" cy="67" r="2.2" fill="#8A9BA8" />
            <line x1="52" y1="67" x2="48" y2="88" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="58" y1="46" x2="60" y2="67" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="60" cy="67" r="2.2" fill="#8A9BA8" />
            <line x1="60" y1="67" x2="62" y2="88" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Pont fessier unilatéral', category: 'post', material: 'Tapis', intact: true,
    prescription: '2 × 10 côté gauche / 1 × 10 côté droit — demi-amplitude si crampe ischio G',
    steps: [
      "Allongé sur le dos, pieds à plat (pas sur les pointes)",
      "Soulever une jambe tendue horizontalement",
      "Pousser le talon au sol, monter le bassin — alignement épaule-hanche-genou",
      "Maintenir 1 sec en haut, fessier contracté fort",
      "Descente contrôlée — bassin ne touche pas le sol entre les reps",
    ],
    warning: 'Ischio gauche : stopper si crampe — passer à demi-amplitude',
    youtubeQuery: 'pont fessier unilateral technique',
    svgLabel: 'Bassin aligné — jambe libre tendue',
    view: 'côté',
    frames: [
      {
        label: 'Bas — bassin proche du sol',
        svg: (
          <svg viewBox="0 0 100 100" width="100%" height="100%">
            <line x1="5" y1="88" x2="95" y2="88" stroke="#2E3840" strokeWidth="1" />
            {/* Tête/épaule/pied au sol restent fixes sur les 4 poses — seuls le bassin et la jambe tendue bougent. */}
            <circle cx="15" cy="79" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="12,73 18,73 15,68" fill={ACCENT} />
            <circle cx="16" cy="86" r="2.2" fill="#8A9BA8" />
            <line x1="16" y1="86" x2="45" y2="84" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="45" cy="84" r="2.2" fill="#8A9BA8" />
            <line x1="45" y1="84" x2="58" y2="66" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="58" cy="66" r="2.2" fill="#8A9BA8" />
            <line x1="58" y1="66" x2="60" y2="87" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="45" y1="84" x2="70" y2="83" stroke={ACCENT} strokeWidth="2" />
            <circle cx="70" cy="83" r="2.2" fill={ACCENT} opacity="0.7" />
            <line x1="70" y1="83" x2="92" y2="82" stroke={ACCENT} strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Montée',
        svg: (
          <svg viewBox="0 0 100 100" width="100%" height="100%">
            <line x1="5" y1="88" x2="95" y2="88" stroke="#2E3840" strokeWidth="1" />
            <circle cx="15" cy="79" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="12,73 18,73 15,68" fill={ACCENT} />
            <circle cx="16" cy="86" r="2.2" fill="#8A9BA8" />
            <line x1="16" y1="86" x2="45" y2="74" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="45" cy="74" r="2.2" fill="#8A9BA8" />
            <line x1="45" y1="74" x2="59" y2="64" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="59" cy="64" r="2.2" fill="#8A9BA8" />
            <line x1="59" y1="64" x2="60" y2="87" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="45" y1="74" x2="70" y2="70" stroke={ACCENT} strokeWidth="2" />
            <circle cx="70" cy="70" r="2.2" fill={ACCENT} opacity="0.7" />
            <line x1="70" y1="70" x2="93" y2="66" stroke={ACCENT} strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Haut — alignement épaule-hanche-genou',
        svg: (
          <svg viewBox="0 0 100 100" width="100%" height="100%">
            <line x1="5" y1="88" x2="95" y2="88" stroke="#2E3840" strokeWidth="1" />
            <circle cx="15" cy="79" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="12,73 18,73 15,68" fill={ACCENT} />
            <circle cx="16" cy="86" r="2.2" fill="#8A9BA8" />
            {/* Ligne guide en pointillés : épaule → hanche → genou doivent être alignés en haut du mouvement. */}
            <line x1="16" y1="86" x2="90" y2="30" stroke="#F59E0B" strokeWidth="1" strokeDasharray="2,2" opacity="0.6" />
            <line x1="16" y1="86" x2="45" y2="64" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="45" cy="64" r="2.2" fill="#8A9BA8" />
            <line x1="45" y1="64" x2="62" y2="58" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="62" cy="58" r="2.2" fill="#8A9BA8" />
            <line x1="62" y1="58" x2="60" y2="87" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="45" y1="64" x2="68" y2="46" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="68" cy="46" r="2.2" fill={ACCENT} opacity="0.7" />
            <line x1="68" y1="46" x2="90" y2="30" stroke={ACCENT} strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Descente — contrôlée',
        svg: (
          <svg viewBox="0 0 100 100" width="100%" height="100%">
            <line x1="5" y1="88" x2="95" y2="88" stroke="#2E3840" strokeWidth="1" />
            <circle cx="15" cy="79" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="12,73 18,73 15,68" fill={ACCENT} />
            <circle cx="16" cy="86" r="2.2" fill="#8A9BA8" />
            <line x1="16" y1="86" x2="45" y2="74" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="45" cy="74" r="2.2" fill="#8A9BA8" />
            <line x1="45" y1="74" x2="59" y2="64" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="59" cy="64" r="2.2" fill="#8A9BA8" />
            <line x1="59" y1="64" x2="60" y2="87" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="45" y1="74" x2="70" y2="70" stroke={ACCENT} strokeWidth="2" />
            <circle cx="70" cy="70" r="2.2" fill={ACCENT} opacity="0.7" />
            <line x1="70" y1="70" x2="93" y2="66" stroke={ACCENT} strokeWidth="2" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Nordic Curl', category: 'post', material: 'Tapis + meuble',
    prescription: '3 × 5-8 — introduire prudemment — jamais J-2 avant séance clé',
    steps: [
      "À genoux sur tapis, chevilles coincées sous un meuble lourd",
      "Corps droit, gainage actif — bras croisés sur la poitrine",
      "Laisser le corps tomber vers l'avant en résistant avec les ischios — 3-4 sec",
      "Quand tu ne tiens plus, poser les mains et pousser pour remonter",
      "Seule la descente est excentrique — remontée aidée par les bras",
    ],
    warning: 'Très intense — 3 séries max en début d’intégration — courbatures D+2 garanties',
    youtubeQuery: 'nordic curl technique débutant',
    svgLabel: 'Corps rigide — résister avec les ischios',
    view: 'côté',
    frames: [
      {
        label: 'Départ — à genoux, corps droit',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="4" y1="72" x2="56" y2="72" stroke="#2E3840" strokeWidth="1" />
            {/* Le genou (44,52, point orange) est le pivot FIXE — la cheville, coincée sous le meuble,
                reste elle aussi fixe (44,70). Seul le buste (rigide, "corps droit") bascule autour du genou. */}
            <rect x="38" y="64" width="14" height="8" fill="#2E3840" rx="1.5" />
            <line x1="44" y1="52" x2="44" y2="70" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="44" cy="70" r="2" fill="#8A9BA8" />
            <circle cx="44" cy="52" r="2.6" fill="#F59E0B" />
            <circle cx="38" cy="13" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="32,10.5 32,15.5 25,13" fill={ACCENT} />
            <line x1="44" y1="19" x2="41" y2="16" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="44" cy="19" r="2.2" fill="#8A9BA8" />
            <line x1="40" y1="28" x2="48" y2="36" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="48" y1="28" x2="40" y2="36" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="44" y1="19" x2="44" y2="52" stroke="#E8EDF1" strokeWidth="2.5" />
          </svg>
        ),
      },
      {
        label: 'Bascule avant — les ischios résistent',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="4" y1="72" x2="56" y2="72" stroke="#2E3840" strokeWidth="1" />
            <rect x="38" y="64" width="14" height="8" fill="#2E3840" rx="1.5" />
            <line x1="44" y1="52" x2="44" y2="70" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="44" cy="70" r="2" fill="#8A9BA8" />
            <circle cx="44" cy="52" r="2.6" fill="#F59E0B" />
            <circle cx="27" cy="21" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="21,18.5 21,23.5 14,21" fill={ACCENT} />
            <line x1="33" y1="27" x2="30" y2="24" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="33" cy="27" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="35" x2="37" y2="42" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="37" y1="35" x2="30" y2="42" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="33" y1="27" x2="44" y2="52" stroke="#E8EDF1" strokeWidth="2.5" />
          </svg>
        ),
      },
      {
        label: 'Résistance maximale — sur le point de lâcher',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="4" y1="72" x2="56" y2="72" stroke="#2E3840" strokeWidth="1" />
            <rect x="38" y="64" width="14" height="8" fill="#2E3840" rx="1.5" />
            <line x1="44" y1="52" x2="44" y2="70" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="44" cy="70" r="2" fill="#8A9BA8" />
            <circle cx="44" cy="52" r="2.6" fill="#F59E0B" />
            <circle cx="15" cy="29" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="9,26.5 9,31.5 2,29" fill={ACCENT} />
            <line x1="21" y1="35" x2="18" y2="32" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="21" cy="35" r="2.2" fill="#8A9BA8" />
            {/* Mains posées au sol devant — "quand tu ne tiens plus, poser les mains et pousser". */}
            <line x1="21" y1="35" x2="14" y2="52" stroke={ACCENT} strokeWidth="2" />
            <circle cx="12" cy="54" r="3" fill={ACCENT} opacity="0.6" />
            <line x1="21" y1="35" x2="44" y2="52" stroke="#E8EDF1" strokeWidth="2.5" />
          </svg>
        ),
      },
      {
        label: 'Remontée — poussée des bras + genou',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="4" y1="72" x2="56" y2="72" stroke="#2E3840" strokeWidth="1" />
            <rect x="38" y="64" width="14" height="8" fill="#2E3840" rx="1.5" />
            <line x1="44" y1="52" x2="44" y2="70" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="44" cy="70" r="2" fill="#8A9BA8" />
            <circle cx="44" cy="52" r="2.6" fill="#F59E0B" />
            <circle cx="27" cy="21" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="21,18.5 21,23.5 14,21" fill={ACCENT} />
            <line x1="33" y1="27" x2="30" y2="24" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="33" cy="27" r="2.2" fill="#8A9BA8" />
            <line x1="33" y1="27" x2="24" y2="40" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="33" y1="27" x2="44" y2="52" stroke="#E8EDF1" strokeWidth="2.5" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'KB Swing', category: 'post', material: 'KB 12kg',
    prescription: '3 × 15 — chaîne postérieure + gainage explosif — excellent transfert montée trail',
    steps: [
      "Pieds largeur d'épaules, KB entre les pieds légèrement en arrière",
      "Charnière de hanche : dos plat, KB balancé vers l'arrière entre les jambes",
      "Impulsion explosive des hanches vers l'avant — pas de squat, c'est un hip hinge",
      "KB monte jusqu'à hauteur des épaules — bras tendus, pas de tirage des bras",
      "Contracter fessiers et abdos en haut — laisser redescendre en contrôlant",
    ],
    warning: 'C’est un mouvement de hanches, pas de bras — le KB est propulsé par les hanches uniquement',
    youtubeQuery: 'kettlebell swing technique français',
    svgLabel: 'Impulsion des hanches — pas des bras',
    view: 'côté',
    frames: [
      {
        label: 'Arrière — charnière, KB entre les jambes',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="4" y1="72" x2="52" y2="72" stroke="#2E3840" strokeWidth="1" />
            {/* Les pieds (23/37,72) sont FIXES sur les 4 poses — position debout inchangée. Seuls la
                hanche, le buste et le KB bougent dans l'arc du swing. */}
            <circle cx="19" cy="18" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="13,15.5 13,20.5 6,18" fill={ACCENT} />
            <line x1="25" y1="24" x2="22" y2="21" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="25" cy="24" r="2.2" fill="#8A9BA8" />
            <line x1="25" y1="24" x2="30" y2="44" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="30" cy="44" r="2.4" fill="#F59E0B" />
            <line x1="25" y1="24" x2="20" y2="36" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="20" cy="36" r="2" fill="#8A9BA8" />
            <line x1="20" y1="36" x2="18" y2="54" stroke={ACCENT} strokeWidth="2" />
            <circle cx="18" cy="58" r="5" fill="none" stroke={ACCENT} strokeWidth="1.5" />
            <line x1="30" y1="44" x2="23" y2="60" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="23" cy="60" r="2.2" fill="#8A9BA8" />
            <line x1="23" y1="60" x2="23" y2="72" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="30" y1="44" x2="35" y2="60" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="35" cy="60" r="2.2" fill="#8A9BA8" />
            <line x1="35" y1="60" x2="37" y2="72" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Impulsion des hanches',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="4" y1="72" x2="52" y2="72" stroke="#2E3840" strokeWidth="1" />
            <circle cx="26" cy="16" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="20,13.5 20,18.5 13,16" fill={ACCENT} />
            <line x1="32" y1="22" x2="29" y2="19" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="32" cy="22" r="2.2" fill="#8A9BA8" />
            <line x1="32" y1="22" x2="30" y2="44" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="30" cy="44" r="2.4" fill="#F59E0B" />
            <line x1="32" y1="22" x2="26" y2="30" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="26" cy="30" r="2" fill="#8A9BA8" />
            <line x1="26" y1="30" x2="27" y2="46" stroke={ACCENT} strokeWidth="2" />
            <circle cx="28" cy="50" r="5" fill="none" stroke={ACCENT} strokeWidth="1.5" />
            <line x1="30" y1="44" x2="24" y2="60" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="24" cy="60" r="2.2" fill="#8A9BA8" />
            <line x1="24" y1="60" x2="23" y2="72" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="30" y1="44" x2="36" y2="60" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="36" cy="60" r="2.2" fill="#8A9BA8" />
            <line x1="36" y1="60" x2="37" y2="72" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Avant — KB à hauteur d’épaules',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="4" y1="72" x2="52" y2="72" stroke="#2E3840" strokeWidth="1" />
            <circle cx="30" cy="14" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="24,11.5 24,16.5 17,14" fill={ACCENT} />
            <line x1="36" y1="20" x2="33" y2="17" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="36" cy="20" r="2.2" fill="#8A9BA8" />
            <line x1="36" y1="20" x2="30" y2="44" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="30" cy="44" r="2.4" fill="#F59E0B" />
            <line x1="36" y1="20" x2="22" y2="18" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="22" cy="18" r="2" fill="#8A9BA8" />
            <line x1="22" y1="18" x2="13" y2="15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="10" cy="14" r="5" fill="none" stroke={ACCENT} strokeWidth="1.5" />
            <line x1="30" y1="44" x2="24" y2="60" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="24" cy="60" r="2.2" fill="#8A9BA8" />
            <line x1="24" y1="60" x2="23" y2="72" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="30" y1="44" x2="36" y2="60" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="36" cy="60" r="2.2" fill="#8A9BA8" />
            <line x1="36" y1="60" x2="37" y2="72" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Retour — charnière contrôlée',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="4" y1="72" x2="52" y2="72" stroke="#2E3840" strokeWidth="1" />
            <circle cx="26" cy="16" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="20,13.5 20,18.5 13,16" fill={ACCENT} />
            <line x1="32" y1="22" x2="29" y2="19" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="32" cy="22" r="2.2" fill="#8A9BA8" />
            <line x1="32" y1="22" x2="30" y2="44" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="30" cy="44" r="2.4" fill="#F59E0B" />
            <line x1="32" y1="22" x2="26" y2="30" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="26" cy="30" r="2" fill="#8A9BA8" />
            <line x1="26" y1="30" x2="27" y2="46" stroke={ACCENT} strokeWidth="2" />
            <circle cx="28" cy="50" r="5" fill="none" stroke={ACCENT} strokeWidth="1.5" />
            <line x1="30" y1="44" x2="24" y2="60" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="24" cy="60" r="2.2" fill="#8A9BA8" />
            <line x1="24" y1="60" x2="23" y2="72" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="30" y1="44" x2="36" y2="60" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="36" cy="60" r="2.2" fill="#8A9BA8" />
            <line x1="36" y1="60" x2="37" y2="72" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Step-down excentrique', category: 'quad', material: 'Escalier', intact: true,
    prescription: '3-4 × 10 chaque jambe — descente en 4 secondes — exercice clé descentes trail',
    steps: [
      "Debout sur une marche, une jambe dans le vide",
      "Descendre en fléchissant la jambe d'appui — 4 secondes très lent",
      "Talon de la jambe libre effleure le sol sans y poser le poids",
      "Remonter en 1 seconde — jambe d'appui uniquement",
      "Genou dans l'axe du pied — ne jamais le laisser partir en dedans",
    ],
    warning: 'Progression : S1→3×10 | S2→4×10 | S3→4×12 — réduire si quadris chargés',
    youtubeQuery: 'step down excentrique trail genoux',
    svgLabel: "Descente lente 4 sec — genou dans l'axe",
    view: 'côté',
    frames: [
      {
        label: 'Départ — jambe libre dans le vide',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="4" y="55" width="52" height="6" fill="#2E3840" rx="2" />
            {/* Le pied d'appui (27,55, sur la marche) est FIXE sur les 4 poses — seuls la hanche/le buste
                (qui descendent) et la jambe libre (dans le vide) bougent. */}
            <circle cx="27" cy="55" r="2.2" fill="#F59E0B" />
            <circle cx="24" cy="12" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="18,9.5 18,14.5 11,12" fill={ACCENT} />
            <line x1="30" y1="18" x2="27" y2="15" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="18" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="18" x2="30" y2="45" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="30" cy="45" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="45" x2="27" y2="55" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="30" y1="45" x2="40" y2="58" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="40" cy="58" r="2.2" fill="#8A9BA8" />
            <line x1="40" y1="58" x2="46" y2="58" stroke="#8A9BA8" strokeWidth="1" />
          </svg>
        ),
      },
      {
        label: 'Descente (2 sec) — genou plie, pied d’appui fixe',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="4" y="55" width="52" height="6" fill="#2E3840" rx="2" />
            <circle cx="27" cy="55" r="2.2" fill="#F59E0B" />
            <circle cx="26" cy="22" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="20,19.5 20,24.5 13,22" fill={ACCENT} />
            <line x1="32" y1="28" x2="29" y2="25" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="32" cy="28" r="2.2" fill="#8A9BA8" />
            <line x1="32" y1="28" x2="35" y2="49" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="35" cy="49" r="2.2" fill="#8A9BA8" />
            <line x1="35" y1="49" x2="27" y2="55" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="35" y1="49" x2="45" y2="63" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="45" cy="63" r="2.2" fill="#8A9BA8" />
            <line x1="45" y1="63" x2="50" y2="64" stroke="#8A9BA8" strokeWidth="1" />
          </svg>
        ),
      },
      {
        label: 'Bas — talon libre effleure le sol',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="4" y="55" width="52" height="6" fill="#2E3840" rx="2" />
            <circle cx="27" cy="55" r="2.2" fill="#F59E0B" />
            <circle cx="30" cy="33" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="24,30.5 24,35.5 17,33" fill={ACCENT} />
            <line x1="36" y1="39" x2="33" y2="36" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="36" cy="39" r="2.2" fill="#8A9BA8" />
            <line x1="36" y1="39" x2="44" y2="58" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="44" cy="58" r="2.2" fill="#8A9BA8" />
            <line x1="44" y1="58" x2="27" y2="55" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="44" y1="58" x2="52" y2="76" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="52" cy="76" r="2.2" fill="#8A9BA8" />
            <line x1="52" y1="76" x2="57" y2="78" stroke="#8A9BA8" strokeWidth="1" />
          </svg>
        ),
      },
      {
        label: 'Remontée (1 sec) — pousse sur la jambe d’appui',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="4" y="55" width="52" height="6" fill="#2E3840" rx="2" />
            <circle cx="27" cy="55" r="2.2" fill="#F59E0B" />
            <circle cx="26" cy="22" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="20,19.5 20,24.5 13,22" fill={ACCENT} />
            <line x1="32" y1="28" x2="29" y2="25" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="32" cy="28" r="2.2" fill="#8A9BA8" />
            <line x1="32" y1="28" x2="35" y2="49" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="35" cy="49" r="2.2" fill="#8A9BA8" />
            <line x1="35" y1="49" x2="27" y2="55" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="35" y1="49" x2="45" y2="63" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="45" cy="63" r="2.2" fill="#8A9BA8" />
            <line x1="45" y1="63" x2="50" y2="64" stroke="#8A9BA8" strokeWidth="1" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Squat bulgare', category: 'quad', material: 'KB 12kg + Chaise',
    prescription: '3 × 12 chaque jambe — KB tenu des deux mains',
    steps: [
      "Pied arrière posé sur la chaise — pied avant à 60-70cm devant",
      "Descente verticale — genou avant ne dépasse pas le bout du pied",
      "Cuisse avant parallèle au sol en bas — genou arrière effleure le sol",
      "Remonter en poussant le talon avant dans le sol",
      "Buste légèrement incliné en avant — ne pas rester trop vertical",
    ],
    youtubeQuery: 'squat bulgare kettlebell technique',
    svgLabel: 'Pied arrière sur chaise — descente verticale',
    view: 'côté',
    frames: [
      {
        label: 'Départ — debout, pied avant au sol',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="34" y="48" width="24" height="5" fill="#2E3840" rx="2" />
            <rect x="34" y="53" width="5" height="20" fill="#2E3840" />
            <rect x="53" y="53" width="5" height="20" fill="#2E3840" />
            {/* Pied avant (10,82) FIXE au sol, pied arrière (55,50) FIXE sur la chaise — seul le buste,
                qui descend verticalement entre les deux, bouge d'une pose à l'autre. */}
            <circle cx="10" cy="82" r="2.2" fill="#F59E0B" />
            <circle cx="16" cy="12" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="10,9.5 10,14.5 3,12" fill={ACCENT} />
            <line x1="22" y1="18" x2="19" y2="15" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="22" cy="18" r="2.2" fill="#8A9BA8" />
            <line x1="22" y1="18" x2="18" y2="45" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="18" cy="45" r="2.2" fill="#8A9BA8" />
            <line x1="18" y1="45" x2="12" y2="65" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="12" cy="65" r="2" fill="#8A9BA8" />
            <line x1="12" y1="65" x2="10" y2="82" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="18" y1="45" x2="40" y2="50" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="40" cy="50" r="2" fill="#8A9BA8" />
            <line x1="40" y1="50" x2="55" y2="50" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Descente',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="34" y="48" width="24" height="5" fill="#2E3840" rx="2" />
            <rect x="34" y="53" width="5" height="20" fill="#2E3840" />
            <rect x="53" y="53" width="5" height="20" fill="#2E3840" />
            <circle cx="10" cy="82" r="2.2" fill="#F59E0B" />
            <circle cx="14" cy="22" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="8,19.5 8,24.5 1,22" fill={ACCENT} />
            <line x1="20" y1="28" x2="17" y2="25" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="20" cy="28" r="2.2" fill="#8A9BA8" />
            <line x1="20" y1="28" x2="16" y2="52" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="16" cy="52" r="2.2" fill="#8A9BA8" />
            <line x1="16" y1="52" x2="8" y2="68" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="8" cy="68" r="2" fill="#8A9BA8" />
            <line x1="8" y1="68" x2="10" y2="82" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="16" y1="52" x2="40" y2="55" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="40" cy="55" r="2" fill="#8A9BA8" />
            <line x1="40" y1="55" x2="55" y2="50" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Bas — cuisse avant parallèle au sol',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="34" y="48" width="24" height="5" fill="#2E3840" rx="2" />
            <rect x="34" y="53" width="5" height="20" fill="#2E3840" />
            <rect x="53" y="53" width="5" height="20" fill="#2E3840" />
            <circle cx="10" cy="82" r="2.2" fill="#F59E0B" />
            <circle cx="16" cy="32" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="10,29.5 10,34.5 3,32" fill={ACCENT} />
            <line x1="22" y1="38" x2="19" y2="35" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="22" cy="38" r="2.2" fill="#8A9BA8" />
            <line x1="22" y1="38" x2="20" y2="58" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="20" cy="58" r="2.2" fill="#8A9BA8" />
            <line x1="20" y1="58" x2="4" y2="58" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="4" cy="58" r="2" fill="#8A9BA8" />
            <line x1="4" y1="58" x2="10" y2="82" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="20" y1="58" x2="42" y2="58" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="42" cy="58" r="2" fill="#8A9BA8" />
            <line x1="42" y1="58" x2="55" y2="50" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Remontée — pousse dans le talon avant',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="34" y="48" width="24" height="5" fill="#2E3840" rx="2" />
            <rect x="34" y="53" width="5" height="20" fill="#2E3840" />
            <rect x="53" y="53" width="5" height="20" fill="#2E3840" />
            <circle cx="10" cy="82" r="2.2" fill="#F59E0B" />
            <circle cx="14" cy="22" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="8,19.5 8,24.5 1,22" fill={ACCENT} />
            <line x1="20" y1="28" x2="17" y2="25" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="20" cy="28" r="2.2" fill="#8A9BA8" />
            <line x1="20" y1="28" x2="16" y2="52" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="16" cy="52" r="2.2" fill="#8A9BA8" />
            <line x1="16" y1="52" x2="8" y2="68" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="8" cy="68" r="2" fill="#8A9BA8" />
            <line x1="8" y1="68" x2="10" y2="82" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="16" y1="52" x2="40" y2="55" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="40" cy="55" r="2" fill="#8A9BA8" />
            <line x1="40" y1="55" x2="55" y2="50" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Fentes latérales', category: 'quad', material: 'Poids de corps',
    prescription: '3 × 12 chaque jambe — stabilité terrain technique trail',
    steps: [
      "Pieds parallèles, largeur de hanches — grand pas sur le côté",
      "Plier le genou de la jambe qui part — jambe opposée tendue",
      "Pousser les fesses vers l'arrière — buste droit",
      "Talon de la jambe travaillée bien à plat — ne pas lever le talon",
      "Pousser sur le talon pour revenir — alterner les côtés",
    ],
    youtubeQuery: 'fente laterale technique course trail',
    svgLabel: 'Jambe tendue côté opposé — talon à plat',
    view: 'face',
    frames: [
      {
        label: 'Départ (pieds joints)',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="6" y1="82" x2="54" y2="82" stroke="#2E3840" strokeWidth="1" />
            {/* Le pied droit (36,82, point orange) reste FIXE et à plat sur les 4 poses — c'est la jambe
                gauche qui s'écarte puis revient. */}
            <circle cx="30" cy="14" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="13" r="1" fill="#5A6B78" />
            <circle cx="33" cy="13" r="1" fill="#5A6B78" />
            <line x1="22" y1="20" x2="38" y2="20" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="20" x2="30" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="52" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="52" x2="24" y2="82" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="30" y1="52" x2="36" y2="82" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="36" cy="82" r="2.2" fill="#F59E0B" />
          </svg>
        ),
      },
      {
        label: 'Pas latéral',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="6" y1="82" x2="54" y2="82" stroke="#2E3840" strokeWidth="1" />
            <circle cx="30" cy="16" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="15" r="1" fill="#5A6B78" />
            <circle cx="33" cy="15" r="1" fill="#5A6B78" />
            <line x1="22" y1="22" x2="38" y2="22" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="22" x2="30" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="52" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="52" x2="18" y2="68" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="18" cy="68" r="2" fill="#8A9BA8" />
            <line x1="18" y1="68" x2="14" y2="82" stroke={ACCENT} strokeWidth="2" />
            <line x1="30" y1="52" x2="36" y2="82" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="36" cy="82" r="2.2" fill="#F59E0B" />
          </svg>
        ),
      },
      {
        label: 'Bas — genou plié, jambe opposée tendue',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="6" y1="82" x2="54" y2="82" stroke="#2E3840" strokeWidth="1" />
            <circle cx="30" cy="18" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="17" r="1" fill="#5A6B78" />
            <circle cx="33" cy="17" r="1" fill="#5A6B78" />
            <line x1="22" y1="24" x2="38" y2="24" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="24" x2="30" y2="54" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="54" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="54" x2="6" y2="69" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="6" cy="69" r="2" fill="#8A9BA8" />
            <line x1="6" y1="69" x2="2" y2="82" stroke={ACCENT} strokeWidth="2" />
            <line x1="30" y1="54" x2="36" y2="82" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="36" cy="82" r="2.2" fill="#F59E0B" />
          </svg>
        ),
      },
      {
        label: 'Retour au centre',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="6" y1="82" x2="54" y2="82" stroke="#2E3840" strokeWidth="1" />
            <circle cx="30" cy="16" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="15" r="1" fill="#5A6B78" />
            <circle cx="33" cy="15" r="1" fill="#5A6B78" />
            <line x1="22" y1="22" x2="38" y2="22" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="22" x2="30" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="52" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="52" x2="18" y2="68" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="18" cy="68" r="2" fill="#8A9BA8" />
            <line x1="18" y1="68" x2="14" y2="82" stroke={ACCENT} strokeWidth="2" />
            <line x1="30" y1="52" x2="36" y2="82" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="36" cy="82" r="2.2" fill="#F59E0B" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Fentes marchées', category: 'quad', material: 'Poids de corps',
    prescription: '3 × 12 chaque jambe — en déplacement dans le couloir',
    steps: [
      "Pas en avant large — genou avant à 90°, genou arrière proche du sol",
      "Buste droit, regard devant — ne pas pencher sur le côté",
      "Poser le talon avant en premier — pas la pointe",
      "Pousser sur la jambe avant pour avancer — enchaîner sans pause",
    ],
    youtubeQuery: 'fentes marchées technique running',
    svgLabel: "Genou avant 90° — talon d'abord",
    view: 'côté',
    frames: [
      {
        label: 'Départ (debout)',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="4" y1="82" x2="56" y2="82" stroke="#2E3840" strokeWidth="1" />
            <circle cx="24" cy="12" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="18,9.5 18,14.5 11,12" fill={ACCENT} />
            <line x1="30" y1="18" x2="27" y2="15" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="18" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="18" x2="30" y2="48" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="48" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="48" x2="28" y2="65" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="28" cy="65" r="2" fill="#8A9BA8" />
            <line x1="28" y1="65" x2="26" y2="82" stroke={ACCENT} strokeWidth="2" />
            <line x1="30" y1="48" x2="32" y2="65" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="32" cy="65" r="2" fill="#8A9BA8" />
            <line x1="32" y1="65" x2="34" y2="82" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Grand pas en avant — le talon se pose',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="4" y1="82" x2="56" y2="82" stroke="#2E3840" strokeWidth="1" />
            {/* Une fois le pas posé, le pied avant (12,81) et le pied arrière (40,82) restent FIXES —
                seuls la hanche et le buste descendent entre "Grand pas" et "Bas". */}
            <circle cx="12" cy="81" r="2.2" fill="#F59E0B" />
            <circle cx="29" cy="14" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="23,11.5 23,16.5 16,14" fill={ACCENT} />
            <line x1="35" y1="20" x2="32" y2="17" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="35" cy="20" r="2.2" fill="#8A9BA8" />
            <line x1="35" y1="20" x2="33" y2="49" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="33" cy="49" r="2.2" fill="#8A9BA8" />
            <line x1="33" y1="49" x2="18" y2="63" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="18" cy="63" r="2" fill="#8A9BA8" />
            <line x1="18" y1="63" x2="12" y2="81" stroke={ACCENT} strokeWidth="2" />
            <line x1="33" y1="49" x2="42" y2="68" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="42" cy="68" r="2" fill="#8A9BA8" />
            <line x1="42" y1="68" x2="40" y2="82" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Bas — genou avant 90°, genou arrière proche du sol',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="4" y1="82" x2="56" y2="82" stroke="#2E3840" strokeWidth="1" />
            <circle cx="12" cy="81" r="2.2" fill="#F59E0B" />
            <circle cx="26" cy="21" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="20,18.5 20,23.5 13,21" fill={ACCENT} />
            <line x1="32" y1="27" x2="29" y2="24" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="32" cy="27" r="2.2" fill="#8A9BA8" />
            <line x1="32" y1="27" x2="32" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="32" cy="52" r="2.2" fill="#8A9BA8" />
            <line x1="32" y1="52" x2="12" y2="52" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="12" y1="52" x2="12" y2="81" stroke={ACCENT} strokeWidth="2" />
            <line x1="32" y1="52" x2="40" y2="66" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="40" cy="66" r="2" fill="#8A9BA8" />
            <line x1="40" y1="66" x2="40" y2="82" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Poussée pour avancer',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="4" y1="82" x2="56" y2="82" stroke="#2E3840" strokeWidth="1" />
            <circle cx="12" cy="81" r="2.2" fill="#F59E0B" />
            <circle cx="29" cy="14" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="23,11.5 23,16.5 16,14" fill={ACCENT} />
            <line x1="35" y1="20" x2="32" y2="17" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="35" cy="20" r="2.2" fill="#8A9BA8" />
            <line x1="35" y1="20" x2="33" y2="49" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="33" cy="49" r="2.2" fill="#8A9BA8" />
            <line x1="33" y1="49" x2="18" y2="63" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="18" cy="63" r="2" fill="#8A9BA8" />
            <line x1="18" y1="63" x2="12" y2="81" stroke={ACCENT} strokeWidth="2" />
            <line x1="33" y1="49" x2="42" y2="68" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="42" cy="68" r="2" fill="#8A9BA8" />
            <line x1="42" y1="68" x2="40" y2="82" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Squat pause 3 secondes', category: 'quad', material: 'Poids de corps',
    prescription: '3 × 12 — charge isométrique quadriceps en position basse',
    steps: [
      "Squat classique — descendre jusqu'à cuisses parallèles au sol",
      "Maintenir la position basse 3 secondes — tension maximale quadriceps",
      "Ne pas s'appuyer sur les genoux — rester en tension active",
      "Remontée explosive après la pause — expirer fort",
    ],
    youtubeQuery: 'squat pause isometrique quadriceps',
    svgLabel: 'Position basse tenue — cuisses parallèles',
    view: 'face',
    frames: [
      {
        label: 'Départ (debout)',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="6" y1="84" x2="54" y2="84" stroke="#8A9BA8" strokeWidth="1" />
            {/* Les deux pieds (22/38,84) restent FIXES et à plat au sol sur les 4 poses — seuls hanches
                et genoux descendent puis remontent. */}
            <circle cx="22" cy="84" r="2.2" fill="#F59E0B" />
            <circle cx="38" cy="84" r="2.2" fill="#F59E0B" />
            <circle cx="30" cy="12" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="11" r="1" fill="#5A6B78" />
            <circle cx="33" cy="11" r="1" fill="#5A6B78" />
            <line x1="22" y1="18" x2="38" y2="18" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="18" x2="30" y2="54" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="54" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="54" x2="22" y2="84" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="30" y1="54" x2="38" y2="84" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Descente',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="6" y1="84" x2="54" y2="84" stroke="#8A9BA8" strokeWidth="1" />
            <circle cx="22" cy="84" r="2.2" fill="#F59E0B" />
            <circle cx="38" cy="84" r="2.2" fill="#F59E0B" />
            <circle cx="30" cy="20" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="19" r="1" fill="#5A6B78" />
            <circle cx="33" cy="19" r="1" fill="#5A6B78" />
            <line x1="22" y1="26" x2="38" y2="26" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="26" x2="30" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="52" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="52" x2="36" y2="66" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="36" cy="66" r="2" fill="#8A9BA8" />
            <line x1="36" y1="66" x2="38" y2="84" stroke={ACCENT} strokeWidth="2" />
            <line x1="30" y1="52" x2="24" y2="66" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="24" cy="66" r="2" fill="#8A9BA8" />
            <line x1="24" y1="66" x2="22" y2="84" stroke={ACCENT} strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Bas — maintien 3 sec, cuisses parallèles',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="6" y1="84" x2="54" y2="84" stroke="#8A9BA8" strokeWidth="1" />
            <circle cx="22" cy="84" r="2.2" fill="#F59E0B" />
            <circle cx="38" cy="84" r="2.2" fill="#F59E0B" />
            <circle cx="30" cy="30" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="29" r="1" fill="#5A6B78" />
            <circle cx="33" cy="29" r="1" fill="#5A6B78" />
            <line x1="22" y1="36" x2="38" y2="36" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="36" x2="30" y2="56" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="56" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="56" x2="46" y2="62" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="46" cy="62" r="2" fill="#8A9BA8" />
            <line x1="46" y1="62" x2="38" y2="84" stroke={ACCENT} strokeWidth="2" />
            <line x1="30" y1="56" x2="14" y2="62" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="14" cy="62" r="2" fill="#8A9BA8" />
            <line x1="14" y1="62" x2="22" y2="84" stroke={ACCENT} strokeWidth="2" />
            <text x="30" y="96" textAnchor="middle" fill="#F59E0B" fontSize="9" fontWeight="bold">3 sec</text>
          </svg>
        ),
      },
      {
        label: 'Remontée explosive',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="6" y1="84" x2="54" y2="84" stroke="#8A9BA8" strokeWidth="1" />
            <circle cx="22" cy="84" r="2.2" fill="#F59E0B" />
            <circle cx="38" cy="84" r="2.2" fill="#F59E0B" />
            <circle cx="30" cy="20" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="19" r="1" fill="#5A6B78" />
            <circle cx="33" cy="19" r="1" fill="#5A6B78" />
            <line x1="22" y1="26" x2="38" y2="26" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="26" x2="30" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="52" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="52" x2="36" y2="66" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="36" cy="66" r="2" fill="#8A9BA8" />
            <line x1="36" y1="66" x2="38" y2="84" stroke={ACCENT} strokeWidth="2" />
            <line x1="30" y1="52" x2="24" y2="66" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="24" cy="66" r="2" fill="#8A9BA8" />
            <line x1="24" y1="66" x2="22" y2="84" stroke={ACCENT} strokeWidth="2" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Monster walk', category: 'stab', material: 'Élastique',
    prescription: "3 × 15 aller-retour — meilleur transfert trail que l'abduction statique",
    steps: [
      "Élastique autour des chevilles ou des genoux",
      "Position semi-squat — genoux fléchis 30-40°, buste droit",
      "Marcher latéralement en maintenant la tension — ne pas croiser les pieds",
      "15 pas dans un sens, 15 dans l'autre",
      "Genoux dans l'axe — ne jamais les laisser rentrer",
    ],
    youtubeQuery: 'monster walk elastique abducteurs trail',
    svgLabel: 'Semi-squat — pas latéraux — tension constante',
    view: 'face',
    frames: [
      {
        label: 'Départ (pieds joints, semi-squat)',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="6" y1="84" x2="54" y2="84" stroke="#2E3840" strokeWidth="1" />
            <circle cx="30" cy="14" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="13" r="1" fill="#5A6B78" />
            <circle cx="33" cy="13" r="1" fill="#5A6B78" />
            <line x1="22" y1="20" x2="38" y2="20" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="20" x2="30" y2="50" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="50" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="50" x2="22" y2="68" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="22" cy="68" r="2" fill="#8A9BA8" />
            <line x1="22" y1="68" x2="19" y2="84" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="30" y1="50" x2="38" y2="68" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="38" cy="68" r="2" fill="#8A9BA8" />
            <line x1="38" y1="68" x2="41" y2="84" stroke="#E8EDF1" strokeWidth="2" />
            <path d="M 19 80 Q 30 76 41 80" stroke="#A78BFA" fill="none" strokeWidth="1.5" strokeDasharray="2,2" opacity="0.6" />
          </svg>
        ),
      },
      {
        label: 'Pas latéral (tension augmente)',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="6" y1="84" x2="54" y2="84" stroke="#2E3840" strokeWidth="1" />
            <circle cx="30" cy="14" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="13" r="1" fill="#5A6B78" />
            <circle cx="33" cy="13" r="1" fill="#5A6B78" />
            <line x1="22" y1="20" x2="38" y2="20" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="20" x2="30" y2="50" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="50" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="50" x2="14" y2="66" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="14" cy="66" r="2" fill="#8A9BA8" />
            <line x1="14" y1="66" x2="9" y2="84" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="30" y1="50" x2="46" y2="66" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="46" cy="66" r="2" fill="#8A9BA8" />
            <line x1="46" y1="66" x2="51" y2="84" stroke="#E8EDF1" strokeWidth="2" />
            <path d="M 9 80 Q 30 72 51 80" stroke="#A78BFA" fill="none" strokeWidth="2" strokeDasharray="3,2" />
          </svg>
        ),
      },
      {
        label: 'Tension maximale (pas large)',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="6" y1="84" x2="54" y2="84" stroke="#2E3840" strokeWidth="1" />
            <circle cx="30" cy="16" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="15" r="1" fill="#5A6B78" />
            <circle cx="33" cy="15" r="1" fill="#5A6B78" />
            <line x1="22" y1="22" x2="38" y2="22" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="22" x2="30" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="52" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="52" x2="8" y2="68" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="8" cy="68" r="2" fill="#8A9BA8" />
            <line x1="8" y1="68" x2="4" y2="84" stroke={ACCENT} strokeWidth="2" />
            <line x1="30" y1="52" x2="52" y2="68" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="52" cy="68" r="2" fill="#8A9BA8" />
            <line x1="52" y1="68" x2="56" y2="84" stroke="#E8EDF1" strokeWidth="2" />
            <path d="M 4 80 Q 30 68 56 80" stroke="#A78BFA" fill="none" strokeWidth="2.5" strokeDasharray="3,2" />
          </svg>
        ),
      },
      {
        label: 'Pied rejoint (tension maintenue)',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="6" y1="84" x2="54" y2="84" stroke="#2E3840" strokeWidth="1" />
            <circle cx="30" cy="14" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="13" r="1" fill="#5A6B78" />
            <circle cx="33" cy="13" r="1" fill="#5A6B78" />
            <line x1="22" y1="20" x2="38" y2="20" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="20" x2="30" y2="50" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="50" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="50" x2="14" y2="66" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="14" cy="66" r="2" fill="#8A9BA8" />
            <line x1="14" y1="66" x2="9" y2="84" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="30" y1="50" x2="46" y2="66" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="46" cy="66" r="2" fill="#8A9BA8" />
            <line x1="46" y1="66" x2="51" y2="84" stroke="#E8EDF1" strokeWidth="2" />
            <path d="M 9 80 Q 30 72 51 80" stroke="#A78BFA" fill="none" strokeWidth="2" strokeDasharray="3,2" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Abduction debout élastique', category: 'stab', material: 'Élastique',
    prescription: '3 × 15 chaque côté — stabilité bassin en appui unipodal',
    steps: [
      "Élastique autour des chevilles — debout sur une jambe légèrement fléchie",
      "Soulever la jambe libre latéralement — mouvement lent et contrôlé",
      "Maintenir 1 sec en haut — bassin horizontal, ne pas basculer",
      "Retour contrôlé — jambe ne touche pas le sol entre les reps",
    ],
    youtubeQuery: 'abduction debout elastique fessiers trail',
    svgLabel: 'Appui unipodal — bassin horizontal',
    view: 'face',
    frames: [
      {
        label: 'Départ (jambe au sol)',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <circle cx="30" cy="14" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="13" r="1" fill="#5A6B78" />
            <circle cx="33" cy="13" r="1" fill="#5A6B78" />
            <line x1="22" y1="20" x2="38" y2="20" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="20" x2="30" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="52" r="2.2" fill="#F59E0B" />
            <line x1="30" y1="52" x2="26" y2="80" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="26" y1="80" x2="22" y2="80" stroke="#8A9BA8" strokeWidth="1.5" />
            <line x1="30" y1="52" x2="38" y2="76" stroke="#A78BFA" strokeWidth="2" />
            <line x1="38" y1="76" x2="42" y2="78" stroke="#A78BFA" strokeWidth="1.5" />
          </svg>
        ),
      },
      {
        label: 'Mi-hauteur',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <circle cx="30" cy="14" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="13" r="1" fill="#5A6B78" />
            <circle cx="33" cy="13" r="1" fill="#5A6B78" />
            <line x1="22" y1="20" x2="38" y2="20" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="20" x2="30" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="52" r="2.2" fill="#F59E0B" />
            <line x1="30" y1="52" x2="26" y2="80" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="26" y1="80" x2="22" y2="80" stroke="#8A9BA8" strokeWidth="1.5" />
            <line x1="30" y1="52" x2="52" y2="62" stroke="#A78BFA" strokeWidth="2.5" />
            <line x1="52" y1="62" x2="58" y2="63" stroke="#A78BFA" strokeWidth="1.5" />
            <path d="M 30 58 Q 42 55 52 62" stroke="#A78BFA" fill="none" strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
          </svg>
        ),
      },
      {
        label: 'Haut — maintien 1 sec',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <circle cx="30" cy="14" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="13" r="1" fill="#5A6B78" />
            <circle cx="33" cy="13" r="1" fill="#5A6B78" />
            <line x1="22" y1="20" x2="38" y2="20" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="20" x2="30" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="52" r="2.2" fill="#F59E0B" />
            <line x1="30" y1="52" x2="26" y2="80" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="26" y1="80" x2="22" y2="80" stroke="#8A9BA8" strokeWidth="1.5" />
            <line x1="30" y1="52" x2="58" y2="56" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="58" y1="56" x2="68" y2="56" stroke={ACCENT} strokeWidth="1.5" />
            <path d="M 30 56 Q 46 50 58 56" stroke="#A78BFA" fill="none" strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
          </svg>
        ),
      },
      {
        label: 'Retour contrôlé',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <circle cx="30" cy="14" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="27" cy="13" r="1" fill="#5A6B78" />
            <circle cx="33" cy="13" r="1" fill="#5A6B78" />
            <line x1="22" y1="20" x2="38" y2="20" stroke="#E8EDF1" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="20" x2="30" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="52" r="2.2" fill="#F59E0B" />
            <line x1="30" y1="52" x2="26" y2="80" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="26" y1="80" x2="22" y2="80" stroke="#8A9BA8" strokeWidth="1.5" />
            <line x1="30" y1="52" x2="52" y2="62" stroke="#A78BFA" strokeWidth="2.5" />
            <line x1="52" y1="62" x2="58" y2="63" stroke="#A78BFA" strokeWidth="1.5" />
            <path d="M 30 58 Q 42 55 52 62" stroke="#A78BFA" fill="none" strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Clamshell élastique', category: 'stab', material: 'Élastique + Tapis',
    prescription: '3 × 15 chaque côté — séance B principalement',
    steps: [
      "Allongé sur le côté, élastique au-dessus des genoux — hanches 45°, genoux 90°",
      "Ouvrir le genou supérieur vers le plafond — talons joints",
      "Amplitude max sans que le bassin bascule en arrière",
      "Maintenir 1 sec — retour lent",
    ],
    youtubeQuery: 'clamshell elastique fessiers technique',
    svgLabel: 'Genou du dessus s’ouvre — talons joints',
    view: 'face',
    frames: [
      {
        label: 'Fermé (talons joints)',
        svg: (
          <svg viewBox="0 0 110 90" width="100%" height="100%">
            <line x1="8" y1="80" x2="105" y2="80" stroke="#2E3840" strokeWidth="1" />
            <circle cx="20" cy="35" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="18" cy="33" r="1" fill="#5A6B78" />
            <circle cx="18" cy="37" r="1" fill="#5A6B78" />
            <line x1="20" y1="41" x2="55" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="55" cy="52" r="2.4" fill="#F59E0B" />
            <line x1="55" y1="52" x2="70" y2="65" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="70" cy="65" r="2" fill="#8A9BA8" />
            <line x1="70" y1="65" x2="90" y2="68" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="55" y1="52" x2="70" y2="63" stroke="#A78BFA" strokeWidth="2.5" />
            <line x1="70" y1="63" x2="90" y2="66" stroke="#A78BFA" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Ouverture (mi-course)',
        svg: (
          <svg viewBox="0 0 110 90" width="100%" height="100%">
            <line x1="8" y1="80" x2="105" y2="80" stroke="#2E3840" strokeWidth="1" />
            <circle cx="20" cy="35" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="18" cy="33" r="1" fill="#5A6B78" />
            <circle cx="18" cy="37" r="1" fill="#5A6B78" />
            <line x1="20" y1="41" x2="55" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="55" cy="52" r="2.4" fill="#F59E0B" />
            <line x1="55" y1="52" x2="70" y2="65" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="70" cy="65" r="2" fill="#8A9BA8" />
            <line x1="70" y1="65" x2="90" y2="68" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="55" y1="52" x2="66" y2="48" stroke="#A78BFA" strokeWidth="2.5" />
            <line x1="66" y1="48" x2="85" y2="46" stroke="#A78BFA" strokeWidth="2" />
            <path d="M 55 52 Q 60 50 66 48" stroke="#A78BFA" fill="none" strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
          </svg>
        ),
      },
      {
        label: 'Ouvert — genou levé',
        svg: (
          <svg viewBox="0 0 110 90" width="100%" height="100%">
            <line x1="8" y1="80" x2="105" y2="80" stroke="#2E3840" strokeWidth="1" />
            <circle cx="20" cy="35" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="18" cy="33" r="1" fill="#5A6B78" />
            <circle cx="18" cy="37" r="1" fill="#5A6B78" />
            <line x1="20" y1="41" x2="55" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="55" cy="52" r="2.4" fill="#F59E0B" />
            <line x1="55" y1="52" x2="70" y2="65" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="70" cy="65" r="2" fill="#8A9BA8" />
            <line x1="70" y1="65" x2="90" y2="68" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="55" y1="52" x2="62" y2="34" stroke="#A78BFA" strokeWidth="2.5" />
            <line x1="62" y1="34" x2="80" y2="30" stroke="#A78BFA" strokeWidth="2" />
            <path d="M 55 52 Q 62 46 62 34" stroke="#A78BFA" fill="none" strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
          </svg>
        ),
      },
      {
        label: 'Retour lent',
        svg: (
          <svg viewBox="0 0 110 90" width="100%" height="100%">
            <line x1="8" y1="80" x2="105" y2="80" stroke="#2E3840" strokeWidth="1" />
            <circle cx="20" cy="35" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="18" cy="33" r="1" fill="#5A6B78" />
            <circle cx="18" cy="37" r="1" fill="#5A6B78" />
            <line x1="20" y1="41" x2="55" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="55" cy="52" r="2.4" fill="#F59E0B" />
            <line x1="55" y1="52" x2="70" y2="65" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="70" cy="65" r="2" fill="#8A9BA8" />
            <line x1="70" y1="65" x2="90" y2="68" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="55" y1="52" x2="66" y2="48" stroke="#A78BFA" strokeWidth="2.5" />
            <line x1="66" y1="48" x2="85" y2="46" stroke="#A78BFA" strokeWidth="2" />
            <path d="M 55 52 Q 60 50 66 48" stroke="#A78BFA" fill="none" strokeWidth="1" strokeDasharray="2,2" opacity="0.5" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Mollets excentriques', category: 'chev', material: 'Escalier',
    prescription: '3 × 15 — montée bilatérale, descente unilatérale lente',
    steps: [
      "Talons dans le vide sur une marche — main sur le mur pour l'équilibre",
      "Monter sur les deux pieds — contraction maximale en haut",
      "Descendre sur un seul pied en 3-4 secondes — phase excentrique",
      "Laisser le talon descendre sous la marche — amplitude complète",
    ],
    youtubeQuery: 'mollets excentriques escalier trail',
    svgLabel: 'Montée 2 pieds — descente 1 pied lente',
    view: 'côté',
    frames: [
      {
        label: 'Bas (2 pieds, talons dans le vide)',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="10" y="55" width="40" height="8" fill="#2E3840" rx="2" />
            {/* Le point d'appui avant-pied (34,60, orange) reste FIXE sur les 4 poses — seul le talon
                monte/descend (dorsi/plantar-flexion) et le corps s'élève légèrement en montée. */}
            <circle cx="34" cy="60" r="2.4" fill="#F59E0B" />
            <circle cx="24" cy="62" r="2.4" fill="#F59E0B" />
            <circle cx="30" cy="9" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="24,6.5 24,11.5 18,9" fill={ACCENT} />
            <line x1="30" y1="16" x2="27" y2="13" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="16" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="16" x2="31" y2="25" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="31" cy="25" r="2.2" fill="#8A9BA8" />
            <line x1="31" y1="25" x2="33" y2="40" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="33" cy="40" r="2" fill="#8A9BA8" />
            <line x1="33" y1="40" x2="34" y2="60" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="34" y1="60" x2="20" y2="72" stroke={ACCENT} strokeWidth="2" />
            <line x1="31" y1="25" x2="25" y2="40" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="25" cy="40" r="2" fill="#8A9BA8" />
            <line x1="25" y1="40" x2="24" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="24" y1="62" x2="12" y2="72" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Montée (2 pieds)',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="10" y="55" width="40" height="8" fill="#2E3840" rx="2" />
            <circle cx="34" cy="60" r="2.4" fill="#F59E0B" />
            <circle cx="24" cy="62" r="2.4" fill="#F59E0B" />
            <circle cx="30" cy="7" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="24,4.5 24,9.5 18,7" fill={ACCENT} />
            <line x1="30" y1="14" x2="27" y2="11" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="14" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="14" x2="31" y2="23" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="31" cy="23" r="2.2" fill="#8A9BA8" />
            <line x1="31" y1="23" x2="33" y2="38" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="33" cy="38" r="2" fill="#8A9BA8" />
            <line x1="33" y1="38" x2="34" y2="60" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="34" y1="60" x2="29" y2="58" stroke={ACCENT} strokeWidth="2" />
            <line x1="31" y1="23" x2="25" y2="38" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="25" cy="38" r="2" fill="#8A9BA8" />
            <line x1="25" y1="38" x2="24" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="24" y1="62" x2="20" y2="58" stroke="#E8EDF1" strokeWidth="2" />
            <path d="M 30 50 Q 30 46 30 42" stroke={ACCENT} fill="none" strokeWidth="1.5" strokeDasharray="2,2" />
            <polygon points="30,40 27,46 33,46" fill={ACCENT} />
          </svg>
        ),
      },
      {
        label: 'Un pied levé (haut)',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="10" y="55" width="40" height="8" fill="#2E3840" rx="2" />
            <circle cx="34" cy="60" r="2.4" fill="#F59E0B" />
            <circle cx="30" cy="7" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="24,4.5 24,9.5 18,7" fill={ACCENT} />
            <line x1="30" y1="14" x2="27" y2="11" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="14" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="14" x2="31" y2="23" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="31" cy="23" r="2.2" fill="#8A9BA8" />
            <line x1="31" y1="23" x2="33" y2="38" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="33" cy="38" r="2" fill="#8A9BA8" />
            <line x1="33" y1="38" x2="34" y2="60" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="34" y1="60" x2="29" y2="58" stroke={ACCENT} strokeWidth="2" />
            {/* Jambe libre repliée, décollée du sol — grisée (non porteuse). */}
            <line x1="31" y1="23" x2="42" y2="30" stroke="#8A9BA8" strokeWidth="2" />
            <circle cx="42" cy="30" r="2" fill="#8A9BA8" />
            <line x1="42" y1="30" x2="46" y2="38" stroke="#8A9BA8" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Descente lente 1 pied (3-4 sec)',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="10" y="55" width="40" height="8" fill="#2E3840" rx="2" />
            <circle cx="34" cy="60" r="2.4" fill="#F59E0B" />
            <circle cx="30" cy="9" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="24,6.5 24,11.5 18,9" fill={ACCENT} />
            <line x1="30" y1="16" x2="27" y2="13" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="30" cy="16" r="2.2" fill="#8A9BA8" />
            <line x1="30" y1="16" x2="31" y2="25" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="31" cy="25" r="2.2" fill="#8A9BA8" />
            <line x1="31" y1="25" x2="33" y2="40" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="33" cy="40" r="2" fill="#8A9BA8" />
            <line x1="33" y1="40" x2="34" y2="60" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="34" y1="60" x2="20" y2="72" stroke="#FB923C" strokeWidth="2" />
            <line x1="31" y1="25" x2="42" y2="32" stroke="#8A9BA8" strokeWidth="2" />
            <circle cx="42" cy="32" r="2" fill="#8A9BA8" />
            <line x1="42" y1="32" x2="46" y2="40" stroke="#8A9BA8" strokeWidth="2" />
            <text x="44" y="70" fill="#FB923C" fontSize="8">3-4s</text>
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Single leg calf raise', category: 'chev', material: 'Escalier',
    prescription: '3 × 15 chaque jambe — unilatéral pur, meilleur transfert trail',
    steps: [
      "Une jambe sur la marche, talon dans le vide — jambe libre fléchie",
      "Monter sur la pointe aussi haut que possible — contraction mollet max",
      "Maintenir 1 sec en haut — descente 2-3 secondes",
      "Talon descend sous la marche — amplitude complète",
      "Main sur le mur pour l'équilibre uniquement — ne pas s'y appuyer",
    ],
    youtubeQuery: 'single leg calf raise escalier technique',
    svgLabel: 'Unilatéral — amplitude complète talon',
    view: 'côté',
    frames: [
      {
        label: 'Bas (talon sous la marche)',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="8" y="55" width="34" height="7" fill="#2E3840" rx="2" />
            {/* Avant-pied sur la marche (26,52, orange) FIXE sur les 4 poses — seuls le talon et la
                hauteur du corps varient. */}
            <circle cx="26" cy="52" r="2.4" fill="#F59E0B" />
            <circle cx="26" cy="18" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="20,15.5 20,20.5 14,18" fill={ACCENT} />
            <line x1="26" y1="25" x2="23" y2="22" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="26" cy="25" r="2.2" fill="#8A9BA8" />
            <line x1="26" y1="25" x2="26" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="26" cy="38" r="2" fill="#8A9BA8" />
            <line x1="26" y1="52" x2="22" y2="60" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="26" y1="52" x2="40" y2="62" stroke="#8A9BA8" strokeWidth="2" />
            <line x1="40" y1="62" x2="44" y2="70" stroke="#8A9BA8" strokeWidth="1.5" />
          </svg>
        ),
      },
      {
        label: 'Mi-hauteur',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="8" y="55" width="34" height="7" fill="#2E3840" rx="2" />
            <circle cx="26" cy="52" r="2.4" fill="#F59E0B" />
            <circle cx="26" cy="15" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="20,12.5 20,17.5 14,15" fill={ACCENT} />
            <line x1="26" y1="22" x2="23" y2="19" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="26" cy="22" r="2.2" fill="#8A9BA8" />
            <line x1="26" y1="22" x2="26" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="26" cy="36" r="2" fill="#8A9BA8" />
            <line x1="26" y1="52" x2="25" y2="58" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="26" y1="52" x2="40" y2="60" stroke="#8A9BA8" strokeWidth="2" />
            <line x1="40" y1="60" x2="44" y2="68" stroke="#8A9BA8" strokeWidth="1.5" />
            <path d="M 24 55 Q 24 51 24 47" stroke={ACCENT} fill="none" strokeWidth="1.5" strokeDasharray="2,2" />
          </svg>
        ),
      },
      {
        label: 'Haut — contraction max',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="8" y="55" width="34" height="7" fill="#2E3840" rx="2" />
            <circle cx="26" cy="52" r="2.4" fill="#F59E0B" />
            <circle cx="26" cy="13" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="20,10.5 20,15.5 14,13" fill={ACCENT} />
            <line x1="26" y1="20" x2="23" y2="17" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="26" cy="20" r="2.2" fill="#8A9BA8" />
            <line x1="26" y1="20" x2="26" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="26" cy="35" r="2" fill="#8A9BA8" />
            <line x1="26" y1="52" x2="28" y2="56" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="26" y1="52" x2="42" y2="62" stroke="#8A9BA8" strokeWidth="2" />
            <line x1="42" y1="62" x2="46" y2="72" stroke="#8A9BA8" strokeWidth="1.5" />
            <path d="M 22 50 Q 22 46 22 42" stroke={ACCENT} fill="none" strokeWidth="1.5" strokeDasharray="2,2" />
            <polygon points="22,40 19,46 25,46" fill={ACCENT} />
          </svg>
        ),
      },
      {
        label: 'Descente (2-3 sec)',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <rect x="8" y="55" width="34" height="7" fill="#2E3840" rx="2" />
            <circle cx="26" cy="52" r="2.4" fill="#F59E0B" />
            <circle cx="26" cy="15" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <polygon points="20,12.5 20,17.5 14,15" fill={ACCENT} />
            <line x1="26" y1="22" x2="23" y2="19" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="26" cy="22" r="2.2" fill="#8A9BA8" />
            <line x1="26" y1="22" x2="26" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="26" cy="36" r="2" fill="#8A9BA8" />
            <line x1="26" y1="52" x2="25" y2="58" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="26" y1="52" x2="40" y2="60" stroke="#8A9BA8" strokeWidth="2" />
            <line x1="40" y1="60" x2="44" y2="68" stroke="#8A9BA8" strokeWidth="1.5" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Gainage frontal', category: 'tronc', material: 'Tapis',
    prescription: '3 × 45 sec — bassin horizontal — colonne neutre',
    steps: [
      "Appui sur avant-bras et pointes de pieds — coudes sous les épaules",
      "Corps aligné tête-épaules-hanches-talons — ni creux ni bosse lombaire",
      "Contracter les abdos, les fessiers et les quadris simultanément",
      "Respiration normale — ne pas bloquer",
      "Regard vers le sol — nuque dans le prolongement du dos",
    ],
    youtubeQuery: 'gainage frontal planche technique course',
    svgLabel: 'Corps droit — ni creux ni bosse',
    view: 'côté',
    frames: [
      {
        label: 'Position correcte — corps aligné',
        svg: (
          <svg viewBox="0 0 110 80" width="100%" height="100%">
            <circle cx="18" cy="35" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="21" y1="41" x2="25" y2="45" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="18" y1="41" x2="95" y2="55" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="22" y1="46" x2="30" y2="55" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="30" y1="55" x2="38" y2="55" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="18" cy="41" r="2.2" fill="#8A9BA8" />
            <circle cx="55" cy="48" r="2" fill="#8A9BA8" />
            <line x1="92" y1="54" x2="100" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="92" cy="54" r="2.2" fill="#8A9BA8" />
            <line x1="100" y1="62" x2="108" y2="62" stroke="#8A9BA8" strokeWidth="1.5" />
            <line x1="18" y1="55" x2="108" y2="62" stroke="#06B6D4" strokeWidth="1" strokeDasharray="3,2" opacity="0.4" />
          </svg>
        ),
      },
      {
        label: 'Erreur à éviter — bassin trop haut',
        svg: (
          <svg viewBox="0 0 110 80" width="100%" height="100%">
            <circle cx="18" cy="35" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="21" y1="41" x2="25" y2="45" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="18" y1="41" x2="55" y2="38" stroke="#ef4444" strokeWidth="2.5" />
            <line x1="55" y1="38" x2="95" y2="55" stroke="#ef4444" strokeWidth="2.5" />
            <line x1="22" y1="46" x2="30" y2="55" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="30" y1="55" x2="38" y2="55" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="18" cy="41" r="2.2" fill="#8A9BA8" />
            <circle cx="55" cy="38" r="2" fill="#ef4444" />
            <line x1="92" y1="54" x2="100" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="92" cy="54" r="2.2" fill="#8A9BA8" />
            <line x1="100" y1="62" x2="108" y2="62" stroke="#8A9BA8" strokeWidth="1.5" />
            <line x1="18" y1="55" x2="108" y2="62" stroke="#06B6D4" strokeWidth="1" strokeDasharray="3,2" opacity="0.3" />
          </svg>
        ),
      },
      {
        label: 'Erreur à éviter — bassin qui s’affaisse',
        svg: (
          <svg viewBox="0 0 110 80" width="100%" height="100%">
            <circle cx="18" cy="35" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="21" y1="41" x2="25" y2="45" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="18" y1="41" x2="55" y2="62" stroke="#ef4444" strokeWidth="2.5" />
            <line x1="55" y1="62" x2="95" y2="55" stroke="#ef4444" strokeWidth="2.5" />
            <line x1="22" y1="46" x2="30" y2="55" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="30" y1="55" x2="38" y2="55" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="18" cy="41" r="2.2" fill="#8A9BA8" />
            <circle cx="55" cy="62" r="2" fill="#ef4444" />
            <line x1="92" y1="54" x2="100" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="92" cy="54" r="2.2" fill="#8A9BA8" />
            <line x1="100" y1="62" x2="108" y2="62" stroke="#8A9BA8" strokeWidth="1.5" />
            <line x1="18" y1="55" x2="108" y2="62" stroke="#06B6D4" strokeWidth="1" strokeDasharray="3,2" opacity="0.3" />
          </svg>
        ),
      },
      {
        label: 'Retour à la position correcte',
        svg: (
          <svg viewBox="0 0 110 80" width="100%" height="100%">
            <circle cx="18" cy="35" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="21" y1="41" x2="25" y2="45" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="18" y1="41" x2="95" y2="55" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="22" y1="46" x2="30" y2="55" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="30" y1="55" x2="38" y2="55" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="18" cy="41" r="2.2" fill="#8A9BA8" />
            <circle cx="55" cy="48" r="2" fill="#8A9BA8" />
            <line x1="92" y1="54" x2="100" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <circle cx="92" cy="54" r="2.2" fill="#8A9BA8" />
            <line x1="100" y1="62" x2="108" y2="62" stroke="#8A9BA8" strokeWidth="1.5" />
            <line x1="18" y1="55" x2="108" y2="62" stroke="#06B6D4" strokeWidth="1" strokeDasharray="3,2" opacity="0.4" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Gainage frontal + extension bras', category: 'tronc', material: 'Tapis',
    prescription: '3 × 8 chaque bras — anti-rotation — stabilité dynamique course',
    steps: [
      "Position gainage frontal sur avant-bras",
      "Tendre un bras vers l'avant horizontalement — maintenir 2 sec",
      "Bassin ne bouge pas — résister à la rotation",
      "Retour contrôlé — alterner les bras",
      "Progression : ajouter extension jambe opposée simultanée",
    ],
    youtubeQuery: 'gainage extension bras anti rotation trail',
    svgLabel: 'Bras tendu — bassin immobile',
    view: 'côté',
    frames: [
      {
        label: 'Gainage frontal (appui 2 bras)',
        svg: (
          <svg viewBox="0 0 120 80" width="100%" height="100%">
            <circle cx="25" cy="35" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="19" y1="33" x2="13" y2="35" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="25" y1="41" x2="90" y2="55" stroke="#E8EDF1" strokeWidth="2.5" />
            <line x1="90" y1="55" x2="108" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="108" y1="62" x2="116" y2="62" stroke="#8A9BA8" strokeWidth="1.5" />
            <line x1="38" y1="47" x2="46" y2="55" stroke="#06B6D4" strokeWidth="2" />
            <line x1="46" y1="55" x2="54" y2="55" stroke="#06B6D4" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Bras qui se lève',
        svg: (
          <svg viewBox="0 0 120 80" width="100%" height="100%">
            <circle cx="25" cy="35" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="19" y1="33" x2="13" y2="35" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="25" y1="41" x2="90" y2="55" stroke="#E8EDF1" strokeWidth="2.5" />
            <line x1="90" y1="55" x2="108" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="108" y1="62" x2="116" y2="62" stroke="#8A9BA8" strokeWidth="1.5" />
            <line x1="38" y1="47" x2="46" y2="55" stroke="#06B6D4" strokeWidth="2" />
            <line x1="46" y1="55" x2="54" y2="55" stroke="#06B6D4" strokeWidth="2" />
            <line x1="25" y1="44" x2="14" y2="42" stroke={ACCENT} strokeWidth="2.5" />
          </svg>
        ),
      },
      {
        label: 'Bras tendu à l’horizontale (2 sec)',
        svg: (
          <svg viewBox="0 0 120 80" width="100%" height="100%">
            <circle cx="25" cy="35" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="19" y1="33" x2="13" y2="35" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="25" y1="41" x2="90" y2="55" stroke="#E8EDF1" strokeWidth="2.5" />
            <line x1="90" y1="55" x2="108" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="108" y1="62" x2="116" y2="62" stroke="#8A9BA8" strokeWidth="1.5" />
            <line x1="38" y1="47" x2="46" y2="55" stroke="#06B6D4" strokeWidth="2" />
            <line x1="46" y1="55" x2="54" y2="55" stroke="#06B6D4" strokeWidth="2" />
            <line x1="25" y1="44" x2="6" y2="38" stroke={ACCENT} strokeWidth="2.5" />
            <polygon points="6,38 12,35 10,42" fill={ACCENT} />
          </svg>
        ),
      },
      {
        label: 'Retour contrôlé',
        svg: (
          <svg viewBox="0 0 120 80" width="100%" height="100%">
            <circle cx="25" cy="35" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="19" y1="33" x2="13" y2="35" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="25" y1="41" x2="90" y2="55" stroke="#E8EDF1" strokeWidth="2.5" />
            <line x1="90" y1="55" x2="108" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="108" y1="62" x2="116" y2="62" stroke="#8A9BA8" strokeWidth="1.5" />
            <line x1="38" y1="47" x2="46" y2="55" stroke="#06B6D4" strokeWidth="2" />
            <line x1="46" y1="55" x2="54" y2="55" stroke="#06B6D4" strokeWidth="2" />
            <line x1="25" y1="44" x2="14" y2="42" stroke={ACCENT} strokeWidth="2.5" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Gainage latéral dynamique', category: 'tronc', material: 'Tapis',
    prescription: '3 × 30 sec chaque côté — abducteurs + tronc latéral',
    steps: [
      "Appui sur un avant-bras latéralement — corps aligné de la tête aux pieds",
      "Descendre le bassin vers le sol lentement — sans le poser",
      "Remonter en contractant les obliques et le fessier",
      "Répéter le mouvement montée/descente pendant 30 sec",
      "Bassin ne bascule ni en avant ni en arrière",
    ],
    youtubeQuery: 'gainage lateral dynamique obliques trail',
    svgLabel: 'Montée/descente du bassin — corps aligné',
    view: 'face',
    frames: [
      {
        label: 'Bas (bassin proche du sol)',
        svg: (
          <svg viewBox="0 0 120 65" width="100%" height="100%">
            <line x1="10" y1="60" x2="115" y2="60" stroke="#2E3840" strokeWidth="1" />
            {/* Avant-bras (18,40) et pieds (100,46) restent FIXES sur les 4 poses — seul le bassin (au
                milieu) descend et remonte, comme une bascule entre ces deux appuis. */}
            <circle cx="18" cy="40" r="2.4" fill="#F59E0B" />
            <circle cx="100" cy="46" r="2.4" fill="#F59E0B" />
            <circle cx="13" cy="34" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="11" cy="32" r="1" fill="#5A6B78" />
            <circle cx="11" cy="36" r="1" fill="#5A6B78" />
            <line x1="18" y1="40" x2="58" y2="54" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="58" cy="54" r="2.2" fill="#8A9BA8" />
            <line x1="58" y1="54" x2="100" y2="46" stroke="#E8EDF1" strokeWidth="2.5" />
            <line x1="22" y1="43" x2="30" y2="46" stroke="#06B6D4" strokeWidth="2" />
            <line x1="30" y1="46" x2="38" y2="46" stroke="#06B6D4" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Montée (bassin qui remonte)',
        svg: (
          <svg viewBox="0 0 120 65" width="100%" height="100%">
            <line x1="10" y1="60" x2="115" y2="60" stroke="#2E3840" strokeWidth="1" />
            <circle cx="18" cy="40" r="2.4" fill="#F59E0B" />
            <circle cx="100" cy="46" r="2.4" fill="#F59E0B" />
            <circle cx="13" cy="34" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="11" cy="32" r="1" fill="#5A6B78" />
            <circle cx="11" cy="36" r="1" fill="#5A6B78" />
            <line x1="18" y1="40" x2="58" y2="47" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="58" cy="47" r="2.2" fill="#8A9BA8" />
            <line x1="58" y1="47" x2="100" y2="46" stroke="#E8EDF1" strokeWidth="2.5" />
            <line x1="22" y1="43" x2="30" y2="46" stroke="#06B6D4" strokeWidth="2" />
            <line x1="30" y1="46" x2="38" y2="46" stroke="#06B6D4" strokeWidth="2" />
            <path d="M 58 51 Q 58 47 58 43" stroke={ACCENT} fill="none" strokeWidth="1.5" strokeDasharray="2,2" />
          </svg>
        ),
      },
      {
        label: 'Haut — alignement corps droit',
        svg: (
          <svg viewBox="0 0 120 65" width="100%" height="100%">
            <line x1="10" y1="60" x2="115" y2="60" stroke="#2E3840" strokeWidth="1" />
            <circle cx="18" cy="40" r="2.4" fill="#F59E0B" />
            <circle cx="100" cy="46" r="2.4" fill="#F59E0B" />
            <circle cx="13" cy="34" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="11" cy="32" r="1" fill="#5A6B78" />
            <circle cx="11" cy="36" r="1" fill="#5A6B78" />
            {/* Ligne guide en pointillés : bras-hanche-pieds parfaitement alignés en haut du mouvement. */}
            <line x1="18" y1="40" x2="100" y2="46" stroke="#F59E0B" strokeWidth="1" strokeDasharray="2,2" opacity="0.6" />
            <line x1="18" y1="40" x2="58" y2="43" stroke={ACCENT} strokeWidth="2.5" />
            <circle cx="58" cy="43" r="2.2" fill="#8A9BA8" />
            <line x1="58" y1="43" x2="100" y2="46" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="22" y1="43" x2="30" y2="46" stroke="#06B6D4" strokeWidth="2" />
            <line x1="30" y1="46" x2="38" y2="46" stroke="#06B6D4" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Descente contrôlée',
        svg: (
          <svg viewBox="0 0 120 65" width="100%" height="100%">
            <line x1="10" y1="60" x2="115" y2="60" stroke="#2E3840" strokeWidth="1" />
            <circle cx="18" cy="40" r="2.4" fill="#F59E0B" />
            <circle cx="100" cy="46" r="2.4" fill="#F59E0B" />
            <circle cx="13" cy="34" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <circle cx="11" cy="32" r="1" fill="#5A6B78" />
            <circle cx="11" cy="36" r="1" fill="#5A6B78" />
            <line x1="18" y1="40" x2="58" y2="47" stroke="#E8EDF1" strokeWidth="2.5" />
            <circle cx="58" cy="47" r="2.2" fill="#8A9BA8" />
            <line x1="58" y1="47" x2="100" y2="46" stroke="#E8EDF1" strokeWidth="2.5" />
            <line x1="22" y1="43" x2="30" y2="46" stroke="#06B6D4" strokeWidth="2" />
            <line x1="30" y1="46" x2="38" y2="46" stroke="#06B6D4" strokeWidth="2" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Dead bug', category: 'tronc', material: 'Tapis',
    prescription: '3 × 10 — dos plaqué au sol en permanence — anti-extension lombaire',
    steps: [
      "Allongé sur le dos — bras tendus vers le plafond, genoux à 90° en l'air",
      "Dos plaqué au sol — ne jamais laisser le bas du dos se décoller",
      "Abaisser bras droit et jambe gauche simultanément vers le sol — 3 sec",
      "Membres effleurent le sol sans y déposer le poids",
      "Retour au centre — alterner les côtés",
    ],
    youtubeQuery: 'dead bug technique gainage lombaires',
    svgLabel: 'Dos plaqué — bras/jambe opposés descendent',
    view: 'côté',
    frames: [
      {
        label: 'Départ — bras et genoux en l’air',
        svg: (
          <svg viewBox="0 0 120 80" width="100%" height="100%">
            <line x1="10" y1="55" x2="110" y2="55" stroke="#2E3840" strokeWidth="1" />
            <circle cx="20" cy="48" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="20" y1="41" x2="20" y2="36" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="20" y1="54" x2="65" y2="54" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="54" x2="42" y2="42" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="42" y1="42" x2="52" y2="42" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="54" x2="34" y2="40" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="34" y1="40" x2="26" y2="34" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="55" y1="54" x2="55" y2="42" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="55" y1="42" x2="65" y2="40" stroke="#E8EDF1" strokeWidth="1.5" strokeDasharray="2,2" />
          </svg>
        ),
      },
      {
        label: 'Descente bras droit / jambe gauche',
        svg: (
          <svg viewBox="0 0 120 80" width="100%" height="100%">
            <line x1="10" y1="55" x2="110" y2="55" stroke="#2E3840" strokeWidth="1" />
            <circle cx="20" cy="48" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="20" y1="41" x2="20" y2="36" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="20" y1="54" x2="65" y2="54" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="54" x2="48" y2="48" stroke="#06B6D4" strokeWidth="2" />
            <line x1="48" y1="48" x2="58" y2="48" stroke="#06B6D4" strokeWidth="2" />
            <line x1="40" y1="54" x2="35" y2="41" stroke={ACCENT} strokeWidth="2" />
            <line x1="35" y1="41" x2="25" y2="35" stroke={ACCENT} strokeWidth="2" />
            <line x1="55" y1="54" x2="55" y2="42" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="55" y1="42" x2="65" y2="40" stroke="#E8EDF1" strokeWidth="1.5" strokeDasharray="2,2" />
          </svg>
        ),
      },
      {
        label: 'Bas — membres effleurent le sol',
        svg: (
          <svg viewBox="0 0 120 80" width="100%" height="100%">
            <line x1="10" y1="55" x2="110" y2="55" stroke="#2E3840" strokeWidth="1" />
            <circle cx="20" cy="48" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="20" y1="41" x2="20" y2="36" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="20" y1="54" x2="65" y2="54" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="54" x2="50" y2="44" stroke="#06B6D4" strokeWidth="2" />
            <line x1="50" y1="44" x2="62" y2="44" stroke="#06B6D4" strokeWidth="2" />
            <line x1="40" y1="54" x2="38" y2="42" stroke={ACCENT} strokeWidth="2" />
            <line x1="38" y1="42" x2="28" y2="36" stroke={ACCENT} strokeWidth="2" />
            <line x1="55" y1="54" x2="55" y2="44" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="55" y1="44" x2="65" y2="42" stroke="#E8EDF1" strokeWidth="1.5" strokeDasharray="2,2" />
            <line x1="55" y1="54" x2="75" y2="68" stroke={ACCENT} strokeWidth="2" />
            <line x1="75" y1="68" x2="90" y2="72" stroke={ACCENT} strokeWidth="1.5" strokeDasharray="2,2" />
          </svg>
        ),
      },
      {
        label: 'Retour au centre',
        svg: (
          <svg viewBox="0 0 120 80" width="100%" height="100%">
            <line x1="10" y1="55" x2="110" y2="55" stroke="#2E3840" strokeWidth="1" />
            <circle cx="20" cy="48" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="20" y1="41" x2="20" y2="36" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="20" y1="54" x2="65" y2="54" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="54" x2="48" y2="48" stroke="#06B6D4" strokeWidth="2" />
            <line x1="48" y1="48" x2="58" y2="48" stroke="#06B6D4" strokeWidth="2" />
            <line x1="40" y1="54" x2="35" y2="41" stroke={ACCENT} strokeWidth="2" />
            <line x1="35" y1="41" x2="25" y2="35" stroke={ACCENT} strokeWidth="2" />
            <line x1="55" y1="54" x2="55" y2="42" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="55" y1="42" x2="65" y2="40" stroke="#E8EDF1" strokeWidth="1.5" strokeDasharray="2,2" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Pallof press élastique', category: 'tronc', material: 'Élastique',
    prescription: '3 × 10 chaque côté — anti-rotation — excellent transfert trail en montée',
    steps: [
      "Fixer l'élastique à hauteur de poitrine sur un point fixe (poignée de porte, meuble)",
      "Se placer de côté, perpendiculaire à l'attache — pieds largeur d'épaules",
      "Tenir l'élastique à deux mains contre la poitrine",
      "Pousser les bras vers l'avant en les tendant — résister à la rotation",
      "Maintenir 2 sec bras tendus — revenir lentement",
    ],
    youtubeQuery: 'pallof press elastique anti rotation tronc',
    svgLabel: 'Pousser les bras — résister à la rotation',
    view: 'dessus',
    frames: [
      {
        label: 'Bras à la poitrine (pas de tension)',
        svg: (
          <svg viewBox="0 0 90 100" width="100%" height="100%">
            <rect x="8" y="35" width="6" height="30" fill="#2E3840" rx="2" />
            <line x1="14" y1="50" x2="34" y2="50" stroke="#06B6D4" strokeWidth="2" strokeDasharray="4,2" />
            <circle cx="40" cy="22" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="40" y1="28" x2="40" y2="58" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="40" x2="28" y2="48" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="40" x2="52" y2="48" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="34" y1="50" x2="40" y2="50" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="40" y1="58" x2="30" y2="78" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="58" x2="50" y2="78" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="24" y1="78" x2="56" y2="78" stroke="#8A9BA8" strokeWidth="1" />
          </svg>
        ),
      },
      {
        label: 'Poussée (~40%)',
        svg: (
          <svg viewBox="0 0 90 100" width="100%" height="100%">
            <rect x="8" y="35" width="6" height="30" fill="#2E3840" rx="2" />
            <line x1="14" y1="50" x2="45" y2="50" stroke="#06B6D4" strokeWidth="2" strokeDasharray="4,2" />
            <circle cx="40" cy="22" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="40" y1="28" x2="40" y2="58" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="40" x2="28" y2="48" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="40" x2="52" y2="48" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="35" y1="50" x2="58" y2="50" stroke={ACCENT} strokeWidth="2.5" />
            <polygon points="58,50 52,47 52,53" fill={ACCENT} />
            <line x1="40" y1="58" x2="30" y2="78" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="58" x2="50" y2="78" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="24" y1="78" x2="56" y2="78" stroke="#8A9BA8" strokeWidth="1" />
          </svg>
        ),
      },
      {
        label: 'Bras tendus — résistance max',
        svg: (
          <svg viewBox="0 0 90 100" width="100%" height="100%">
            <rect x="8" y="35" width="6" height="30" fill="#2E3840" rx="2" />
            <line x1="14" y1="50" x2="55" y2="50" stroke="#06B6D4" strokeWidth="2" strokeDasharray="4,2" />
            <circle cx="40" cy="22" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="40" y1="28" x2="40" y2="58" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="40" x2="28" y2="48" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="40" x2="52" y2="48" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="35" y1="50" x2="70" y2="50" stroke={ACCENT} strokeWidth="2.5" />
            <polygon points="70,50 64,47 64,53" fill={ACCENT} />
            <line x1="40" y1="58" x2="30" y2="78" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="58" x2="50" y2="78" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="24" y1="78" x2="56" y2="78" stroke="#8A9BA8" strokeWidth="1" />
          </svg>
        ),
      },
      {
        label: 'Retour (~40%)',
        svg: (
          <svg viewBox="0 0 90 100" width="100%" height="100%">
            <rect x="8" y="35" width="6" height="30" fill="#2E3840" rx="2" />
            <line x1="14" y1="50" x2="45" y2="50" stroke="#06B6D4" strokeWidth="2" strokeDasharray="4,2" />
            <circle cx="40" cy="22" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="40" y1="28" x2="40" y2="58" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="40" x2="28" y2="48" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="40" x2="52" y2="48" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="35" y1="50" x2="58" y2="50" stroke={ACCENT} strokeWidth="2.5" />
            <polygon points="58,50 52,47 52,53" fill={ACCENT} />
            <line x1="40" y1="58" x2="30" y2="78" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="40" y1="58" x2="50" y2="78" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="24" y1="78" x2="56" y2="78" stroke="#8A9BA8" strokeWidth="1" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Bird dog', category: 'tronc', material: 'Tapis',
    prescription: '3 × 10 chaque côté — coordination + gainage profond — excellent pour la scoliose',
    steps: [
      "À quatre pattes — genoux sous les hanches, poignets sous les épaules",
      "Dos plat — bassin neutre, pas de creux lombaire",
      "Tendre le bras droit et la jambe gauche simultanément — horizontaux",
      "Maintenir 3 sec — ni le bras ni la jambe ne montent au-dessus de l'horizontal",
      "Retour contrôlé — alterner les côtés sans balancer le bassin",
    ],
    youtubeQuery: 'bird dog technique gainage dos trail',
    svgLabel: 'Bras et jambe opposés — dos plat',
    view: 'côté',
    frames: [
      {
        label: 'Départ (à quatre pattes)',
        svg: (
          <svg viewBox="0 0 120 80" width="100%" height="100%">
            <circle cx="60" cy="32" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="53" y1="31" x2="47" y2="33" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="60" y1="38" x2="60" y2="58" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="48" y1="48" x2="48" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="72" y1="48" x2="72" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="60" y1="44" x2="48" y2="48" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="60" y1="44" x2="72" y2="48" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="48" y1="62" x2="44" y2="70" stroke="#E8EDF1" strokeWidth="1.5" />
            <line x1="72" y1="62" x2="76" y2="70" stroke="#E8EDF1" strokeWidth="1.5" />
          </svg>
        ),
      },
      {
        label: 'Extension partielle',
        svg: (
          <svg viewBox="0 0 120 80" width="100%" height="100%">
            <circle cx="60" cy="32" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="53" y1="31" x2="47" y2="33" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="60" y1="38" x2="60" y2="58" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="72" y1="48" x2="72" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="72" y1="62" x2="76" y2="70" stroke="#E8EDF1" strokeWidth="1.5" />
            <line x1="60" y1="44" x2="72" y2="48" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="60" y1="44" x2="36" y2="46" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="48" y1="55" x2="48" y2="62" stroke="#06B6D4" strokeWidth="2" />
            <line x1="48" y1="62" x2="44" y2="70" stroke="#06B6D4" strokeWidth="1.5" />
            <line x1="60" y1="50" x2="86" y2="52" stroke="#06B6D4" strokeWidth="2.5" />
          </svg>
        ),
      },
      {
        label: 'Extension max — bras/jambe à l’horizontale',
        svg: (
          <svg viewBox="0 0 120 80" width="100%" height="100%">
            <circle cx="60" cy="32" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="53" y1="31" x2="47" y2="33" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="60" y1="38" x2="60" y2="58" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="72" y1="48" x2="72" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="72" y1="62" x2="76" y2="70" stroke="#E8EDF1" strokeWidth="1.5" />
            <line x1="60" y1="44" x2="72" y2="48" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="60" y1="44" x2="18" y2="44" stroke={ACCENT} strokeWidth="2.5" />
            <polygon points="18,44 24,41 24,47" fill={ACCENT} />
            <line x1="60" y1="50" x2="102" y2="50" stroke="#06B6D4" strokeWidth="2.5" />
            <polygon points="102,50 96,47 96,53" fill="#06B6D4" />
          </svg>
        ),
      },
      {
        label: 'Retour contrôlé',
        svg: (
          <svg viewBox="0 0 120 80" width="100%" height="100%">
            <circle cx="60" cy="32" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="53" y1="31" x2="47" y2="33" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="60" y1="38" x2="60" y2="58" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="72" y1="48" x2="72" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="72" y1="62" x2="76" y2="70" stroke="#E8EDF1" strokeWidth="1.5" />
            <line x1="60" y1="44" x2="72" y2="48" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="60" y1="44" x2="36" y2="46" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="48" y1="55" x2="48" y2="62" stroke="#06B6D4" strokeWidth="2" />
            <line x1="48" y1="62" x2="44" y2="70" stroke="#06B6D4" strokeWidth="1.5" />
            <line x1="60" y1="50" x2="86" y2="52" stroke="#06B6D4" strokeWidth="2.5" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Squat jump', category: 'plio', material: 'Poids de corps',
    prescription: '3 × 10 — idéal en fin de circuit échauffement',
    steps: [
      "Squat descente rapide jusqu'à cuisses parallèles",
      "Impulsion explosive vers le haut — bras lancés pour aider",
      "Réception souple — mi-pied d'abord, jamais talon",
      "Amortir en pliant les genoux — enchaîner immédiatement",
    ],
    warning: 'Jamais J-2 avant séance clé ou course',
    youtubeQuery: 'squat jump pliometrie trail technique',
    svgLabel: 'Impulsion explosive — réception souple',
    view: 'côté',
    frames: [
      {
        label: 'Départ (accroupi)',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="8" y1="82" x2="52" y2="82" stroke="#8A9BA8" strokeWidth="1" />
            <circle cx="30" cy="50" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="37" y1="49" x2="43" y2="51" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="30" y1="56" x2="27" y2="72" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="27" y1="64" x2="17" y2="70" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="27" y1="64" x2="37" y2="70" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="27" y1="72" x2="19" y2="82" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="27" y1="72" x2="35" y2="82" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Impulsion — extension explosive',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="8" y1="82" x2="52" y2="82" stroke="#8A9BA8" strokeWidth="1" />
            <circle cx="30" cy="28" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="37" y1="27" x2="43" y2="29" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="30" y1="34" x2="29" y2="58" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="29" y1="42" x2="18" y2="32" stroke={ACCENT} strokeWidth="2" />
            <line x1="29" y1="42" x2="40" y2="32" stroke={ACCENT} strokeWidth="2" />
            <line x1="29" y1="58" x2="23" y2="72" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="29" y1="58" x2="35" y2="72" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="23" y1="72" x2="21" y2="80" stroke="#E8EDF1" strokeWidth="1.5" />
            <line x1="35" y1="72" x2="37" y2="80" stroke="#E8EDF1" strokeWidth="1.5" />
          </svg>
        ),
      },
      {
        label: 'Haut du saut — genoux repliés',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <circle cx="30" cy="18" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="37" y1="17" x2="43" y2="19" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="30" y1="24" x2="30" y2="50" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="30" y1="36" x2="18" y2="28" stroke={ACCENT} strokeWidth="2" />
            <line x1="30" y1="36" x2="42" y2="28" stroke={ACCENT} strokeWidth="2" />
            <line x1="30" y1="50" x2="23" y2="65" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="30" y1="50" x2="37" y2="65" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Réception souple — mi-pied',
        svg: (
          <svg viewBox="0 0 60 100" width="100%" height="100%">
            <line x1="8" y1="82" x2="52" y2="82" stroke="#8A9BA8" strokeWidth="1" />
            <circle cx="30" cy="50" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="37" y1="49" x2="43" y2="51" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="30" y1="56" x2="27" y2="72" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="27" y1="64" x2="17" y2="70" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="27" y1="64" x2="37" y2="70" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="27" y1="72" x2="19" y2="82" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="27" y1="72" x2="35" y2="82" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
    ],
  },
  {
    name: 'Fentes sautées', category: 'plio', material: 'Poids de corps',
    prescription: '3 × 8 chaque jambe — puissance propulsion montée trail',
    steps: [
      "Position fente basse — genou arrière proche du sol",
      "Sauter vers le haut en changeant les jambes en l'air",
      "Réception directement en fente basse opposée — amortir",
      "Enchaîner sans pause — rythme soutenu",
    ],
    warning: 'Jamais J-2 avant séance clé — réserver aux semaines sans double club',
    youtubeQuery: 'fentes sautées pliometrie trail running',
    svgLabel: "Échange des jambes en l'air — réception fente",
    view: 'côté',
    frames: [
      {
        label: 'Fente basse (départ)',
        svg: (
          <svg viewBox="0 0 100 90" width="100%" height="100%">
            <line x1="4" y1="82" x2="96" y2="82" stroke="#8A9BA8" strokeWidth="1" />
            <circle cx="40" cy="20" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="47" y1="19" x2="53" y2="21" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="40" y1="26" x2="38" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="39" y1="36" x2="30" y2="42" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="39" y1="36" x2="48" y2="42" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="38" y1="52" x2="14" y2="60" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="14" y1="60" x2="10" y2="80" stroke={ACCENT} strokeWidth="2" />
            <line x1="38" y1="52" x2="56" y2="60" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="56" y1="60" x2="78" y2="80" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Impulsion (saut vertical)',
        svg: (
          <svg viewBox="0 0 100 90" width="100%" height="100%">
            <line x1="4" y1="82" x2="96" y2="82" stroke="#8A9BA8" strokeWidth="1" />
            <circle cx="40" cy="14" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="47" y1="13" x2="53" y2="15" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="40" y1="20" x2="39" y2="46" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="39" y1="30" x2="28" y2="22" stroke={ACCENT} strokeWidth="2" />
            <line x1="39" y1="30" x2="50" y2="22" stroke={ACCENT} strokeWidth="2" />
            <line x1="39" y1="46" x2="28" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="28" y1="62" x2="24" y2="76" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="39" y1="46" x2="50" y2="62" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="50" y1="62" x2="54" y2="76" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: "Échange des jambes en l'air",
        svg: (
          <svg viewBox="0 0 100 90" width="100%" height="100%">
            <circle cx="40" cy="18" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="47" y1="17" x2="53" y2="19" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="40" y1="24" x2="38" y2="50" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="39" y1="36" x2="26" y2="28" stroke={ACCENT} strokeWidth="2" />
            <line x1="39" y1="36" x2="52" y2="28" stroke={ACCENT} strokeWidth="2" />
            <line x1="38" y1="50" x2="15" y2="68" stroke="#F43F5E" strokeWidth="2.5" />
            <line x1="15" y1="68" x2="2" y2="80" stroke="#F43F5E" strokeWidth="2" />
            <line x1="38" y1="50" x2="62" y2="58" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="62" y1="58" x2="76" y2="55" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
      {
        label: 'Réception — fente opposée',
        svg: (
          <svg viewBox="0 0 100 90" width="100%" height="100%">
            <line x1="4" y1="82" x2="96" y2="82" stroke="#8A9BA8" strokeWidth="1" />
            <circle cx="40" cy="20" r="7" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
            <line x1="47" y1="19" x2="53" y2="21" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" />
            <line x1="40" y1="26" x2="38" y2="52" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="39" y1="36" x2="30" y2="42" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="39" y1="36" x2="48" y2="42" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="38" y1="52" x2="14" y2="60" stroke={ACCENT} strokeWidth="2.5" />
            <line x1="14" y1="60" x2="10" y2="80" stroke={ACCENT} strokeWidth="2" />
            <line x1="38" y1="52" x2="56" y2="60" stroke="#E8EDF1" strokeWidth="2" />
            <line x1="56" y1="60" x2="78" y2="80" stroke="#E8EDF1" strokeWidth="2" />
          </svg>
        ),
      },
    ],
  },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'intact', label: 'Intouchables' },
  { key: 'all', label: 'Tous' },
  { key: 'post', label: CATEGORY_LABELS.post },
  { key: 'quad', label: CATEGORY_LABELS.quad },
  { key: 'stab', label: CATEGORY_LABELS.stab },
  { key: 'chev', label: CATEGORY_LABELS.chev },
  { key: 'tronc', label: CATEGORY_LABELS.tronc },
  { key: 'plio', label: CATEGORY_LABELS.plio },
];

/* ── Mode Séance — import d'un programme structuré (généré par un Claude perso) ──────────────
 * Format attendu (JSON, tableau d'exercices dans l'ordre à effectuer) :
 *   [{ "id": 5, "series": 3, "reps": 12, "restBetweenSets": 45, "restAfterExercise": 90 }, ...]
 * `id` référence le numéro affiché sur chaque carte (#1 = Romanian Deadlift, etc.).
 * Un exercice utilise soit `reps` (répétitions, avancement manuel) soit `durationSec` (maintien
 * chronométré, ex. gainage) — jamais les deux. `restBetweenSets`/`restAfterExercise` sont en
 * secondes et optionnels (valeurs par défaut ci-dessous).
 */
const DEFAULT_REST_BETWEEN_SETS = 45;
const DEFAULT_REST_AFTER_EXERCISE = 90;

interface SessionItemInput {
  id: number;
  series: number;
  reps?: number;
  durationSec?: number;
  restBetweenSets?: number;
  restAfterExercise?: number;
}

const SESSION_FORMAT_EXAMPLE = `[
  { "id": 1, "series": 3, "reps": 12, "restBetweenSets": 45, "restAfterExercise": 90 },
  { "id": 17, "series": 3, "durationSec": 45, "restBetweenSets": 30 }
]`;

/** Séances par défaut — proposées en un clic dans le formulaire de saisie. */
const DEFAULT_SEANCES: { key: string; label: string; items: SessionItemInput[] }[] = [
  {
    key: 'A', label: 'Séance A',
    items: [
      { id: 1, series: 3, reps: 12, restBetweenSets: 45, restAfterExercise: 90 },
      { id: 5, series: 3, reps: 10, restBetweenSets: 60, restAfterExercise: 90 },
      { id: 4, series: 3, reps: 15, restBetweenSets: 45, restAfterExercise: 90 },
      { id: 6, series: 3, reps: 12, restBetweenSets: 45, restAfterExercise: 90 },
      { id: 7, series: 3, reps: 12, restBetweenSets: 45, restAfterExercise: 90 },
      { id: 10, series: 3, reps: 15, restBetweenSets: 45, restAfterExercise: 90 },
      { id: 14, series: 3, reps: 15, restBetweenSets: 45, restAfterExercise: 90 },
    ],
  },
  {
    key: 'B', label: 'Séance B',
    items: [
      { id: 15, series: 3, durationSec: 45, restBetweenSets: 30, restAfterExercise: 60 },
      { id: 17, series: 3, durationSec: 30, restBetweenSets: 30, restAfterExercise: 60 },
      { id: 2, series: 3, reps: 15, restBetweenSets: 45, restAfterExercise: 90 },
      { id: 12, series: 3, reps: 15, restBetweenSets: 45, restAfterExercise: 90 },
      { id: 18, series: 3, reps: 10, restBetweenSets: 45, restAfterExercise: 90 },
      { id: 16, series: 3, reps: 8, restBetweenSets: 45, restAfterExercise: 90 },
      { id: 20, series: 3, reps: 10, restBetweenSets: 45, restAfterExercise: 90 },
    ],
  },
];

type SessionStep =
  | { kind: 'work'; exercise: Exercise; exerciseNumber: number; setIndex: number; totalSets: number; reps?: number; durationSec?: number }
  | { kind: 'rest'; seconds: number; afterLabel: string; nextLabel: string };

/** Parse et valide le JSON collé par l'utilisateur ; retourne soit les items validés, soit la liste des erreurs. */
function parseSessionInput(raw: string): { items: SessionItemInput[] } | { errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { errors: ["JSON invalide — vérifie la syntaxe (virgules, accolades, guillemets)."] };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { errors: ["Le JSON doit être un tableau non vide d'exercices."] };
  }
  const errors: string[] = [];
  const items: SessionItemInput[] = [];
  parsed.forEach((raw, idx) => {
    const item = raw as Partial<SessionItemInput>;
    const pos = `Élément ${idx + 1}`;
    if (typeof item.id !== 'number' || !EXERCISES[item.id - 1]) {
      errors.push(`${pos} : id ${JSON.stringify(item.id)} invalide (doit être entre 1 et ${EXERCISES.length}).`);
      return;
    }
    if (typeof item.series !== 'number' || item.series < 1) {
      errors.push(`${pos} (#${item.id}) : "series" doit être un nombre ≥ 1.`);
      return;
    }
    if ((item.reps === undefined) === (item.durationSec === undefined)) {
      errors.push(`${pos} (#${item.id}) : indique soit "reps" soit "durationSec", pas les deux ni aucun.`);
      return;
    }
    items.push({
      id: item.id, series: item.series, reps: item.reps, durationSec: item.durationSec,
      restBetweenSets: item.restBetweenSets ?? DEFAULT_REST_BETWEEN_SETS,
      restAfterExercise: item.restAfterExercise ?? DEFAULT_REST_AFTER_EXERCISE,
    });
  });
  return errors.length > 0 ? { errors } : { items };
}

/** Aplatit les exercices/séries en une liste d'étapes séquentielles (travail + repos). */
function buildSessionSteps(items: SessionItemInput[]): SessionStep[] {
  const steps: SessionStep[] = [];
  items.forEach((item, exIdx) => {
    const exercise = EXERCISES[item.id - 1];
    for (let s = 0; s < item.series; s++) {
      steps.push({
        kind: 'work', exercise, exerciseNumber: item.id,
        setIndex: s + 1, totalSets: item.series, reps: item.reps, durationSec: item.durationSec,
      });
      const isLastSetOfExercise = s === item.series - 1;
      const isLastExercise = exIdx === items.length - 1;
      if (!isLastSetOfExercise) {
        steps.push({
          kind: 'rest', seconds: item.restBetweenSets ?? DEFAULT_REST_BETWEEN_SETS,
          afterLabel: `${exercise.name} — série ${s + 1}/${item.series}`,
          nextLabel: `${exercise.name} — série ${s + 2}/${item.series}`,
        });
      } else if (!isLastExercise) {
        const next = EXERCISES[items[exIdx + 1].id - 1];
        steps.push({
          kind: 'rest', seconds: item.restAfterExercise ?? DEFAULT_REST_AFTER_EXERCISE,
          afterLabel: exercise.name, nextLabel: next.name,
        });
      }
    }
  });
  return steps;
}

function formatSeconds(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Joue une tonalité simple — best-effort, ignore si l'API Web Audio est indisponible. */
function playTone(frequency: number, durationSec: number, peakGain: number) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(peakGain, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationSec);
    osc.onended = () => ctx.close();
  } catch { /* environnement sans Web Audio — silencieux */ }
}

/** Petit bip de décompte — joué à 3, 2 et 1 seconde avant la fin d'un repos/maintien. */
function playCountdownTick() {
  playTone(660, 0.12, 0.5);
}

/** Bip long et marqué — joué à la toute fin d'un repos/maintien chronométré. */
function playEndBeep() {
  playTone(880, 0.7, 0.55);
}

interface SessionRunnerProps {
  steps: SessionStep[];
  onExit: () => void;
  onClosePage: () => void;
}

/** Déroulé pas-à-pas d'une séance : étape courante (travail ou repos), minuteur auto pour les
 * repos et les maintiens chronométrés, bouton Suivant pour tout le reste. */
function SessionRunner({ steps, onExit, onClosePage }: SessionRunnerProps) {
  const [index, setIndex] = useState(0);
  const step = index < steps.length ? steps[index] : undefined;
  const isTimed = step ? (step.kind === 'rest' || step.durationSec !== undefined) : false;
  const initialSeconds = step ? (step.kind === 'rest' ? step.seconds : (step.durationSec ?? 0)) : 0;
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  const [paused, setPaused] = useState(false);

  // Décompte de départ (3, 2, 1, GO) avant la toute première étape — style "départ de course".
  const [starting, setStarting] = useState(true);
  const [preSeconds, setPreSeconds] = useState(3);
  useEffect(() => {
    if (!starting) return;
    if (preSeconds > 0) {
      playCountdownTick();
      const t = setTimeout(() => setPreSeconds(s => s - 1), 1000);
      return () => clearTimeout(t);
    }
    playEndBeep();
    const t = setTimeout(() => setStarting(false), 700);
    return () => clearTimeout(t);
  }, [starting, preSeconds]);

  // Réinitialise le minuteur (et la pause) à chaque changement d'étape.
  useEffect(() => { setSecondsLeft(initialSeconds); setPaused(false); }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // Remonte en haut de page à chaque étape (y compris au lancement) — sur mobile, le "scroll
  // anchoring" du navigateur laisse parfois la page ancrée en bas après le remplacement du
  // formulaire par le lecteur, ce qui masque la barre "Étape X/N" sous l'en-tête sticky de l'app.
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }, [index]);

  // Décompte automatique pour les repos et les maintiens chronométrés — bip à zéro. Suspendu
  // pendant le décompte de départ (starting) et pendant une pause manuelle.
  useEffect(() => {
    if (starting || paused || !isTimed || secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [starting, paused, isTimed, secondsLeft]);
  useEffect(() => {
    if (starting || paused || !isTimed) return;
    if (secondsLeft === 0) playEndBeep();
    else if (secondsLeft === 1 || secondsLeft === 2 || secondsLeft === 3) playCountdownTick();
  }, [starting, paused, isTimed, secondsLeft]);

  const goNext = () => {
    if (index < steps.length - 1) setIndex(index + 1);
    else setIndex(steps.length); // dépasse la borne → écran "terminé"
  };
  const goPrev = () => { if (index > 0) setIndex(index - 1); };

  if (starting) {
    return (
      <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
        <button type="button" onClick={onClosePage} aria-label="Fermer la page renforcement"
          style={{ position: 'absolute', top: '1rem', right: '1.25rem', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '0.2rem' }}>
          <X size={16} />
        </button>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '1rem' }}>
          La séance commence...
        </div>
        <div style={{ fontSize: '4.5rem', fontWeight: 800, color: 'var(--accent-primary)', lineHeight: 1 }}>
          {preSeconds > 0 ? preSeconds : 'GO !'}
        </div>
      </div>
    );
  }

  if (!step) {
    return (
      <div style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏁</div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>Séance terminée</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          {steps.filter(s => s.kind === 'work').length} séries effectuées. Bien joué.
        </p>
        <button type="button" className="btn btn-outline" onClick={onExit} style={{ padding: '0.6rem 1.2rem' }}>
          Nouvelle séance
        </button>
      </div>
    );
  }

  const progressPct = Math.round((index / steps.length) * 100);

  return (
    // padding-bottom réserve la place de la barre d'action fixe (position: fixed, hors du flux) —
    // sans ça le dernier contenu (SVG) se retrouve caché derrière sur petit écran.
    <div style={{ padding: '1rem 1.5rem calc(88px + env(safe-area-inset-bottom, 0px))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', gap: '0.5rem' }}>
        <button type="button" onClick={onClosePage} aria-label="Fermer la page renforcement"
          style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '0.2rem', display: 'flex', flexShrink: 0 }}>
          <X size={16} />
        </button>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', flex: 1, textAlign: 'center' }}>Étape {index + 1}/{steps.length}</span>
        <button type="button" onClick={onExit} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
          Quitter la séance
        </button>
      </div>
      <div style={{ height: 4, background: 'var(--bg-secondary)', borderRadius: 999, overflow: 'hidden', marginBottom: '1.5rem' }}>
        <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--accent-primary)', transition: 'width 0.2s' }} />
      </div>

      {step.kind === 'rest' ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Repos — après {step.afterLabel}</div>
          <div style={{ fontSize: '3rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--accent-primary)', margin: '0.5rem 0 0.75rem' }}>
            {formatSeconds(secondsLeft)}
          </div>
          <button type="button" onClick={() => setPaused(p => !p)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.85rem', borderRadius: 999,
              border: '1px solid var(--accent-primary)', background: paused ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'transparent',
              color: 'var(--accent-primary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.75rem',
            }}>
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? 'Reprendre' : 'Pause'}
          </button>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>Ensuite : {step.nextLabel}</div>
        </div>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: CATEGORY_COLORS[step.exercise.category], flexShrink: 0 }} />
            <span style={{ fontSize: '0.7rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-tertiary)', flexShrink: 0 }}>#{step.exerciseNumber}</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{step.exercise.name}</span>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
            Série {step.setIndex}/{step.totalSets}
          </div>
          {step.durationSec !== undefined ? (
            <>
              <div style={{ fontSize: '3rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--accent-primary)', margin: '0.5rem 0 0.75rem' }}>
                {formatSeconds(secondsLeft)}
              </div>
              <button type="button" onClick={() => setPaused(p => !p)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.35rem 0.85rem', borderRadius: 999,
                  border: '1px solid var(--accent-primary)', background: paused ? 'color-mix(in srgb, var(--accent-primary) 12%, transparent)' : 'transparent',
                  color: 'var(--accent-primary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.75rem',
                }}>
                {paused ? <Play size={14} /> : <Pause size={14} />}
                {paused ? 'Reprendre' : 'Pause'}
              </button>
            </>
          ) : (
            <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0.5rem 0 0.75rem' }}>
              {step.reps} reps
            </div>
          )}
          <PoseAnimator frames={step.exercise.frames} svgLabel={step.exercise.svgLabel} view={step.exercise.view} size={140} />

          <div style={{ textAlign: 'left', marginTop: '1rem', padding: '0.75rem 0.9rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
              Exécution
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: 0, margin: 0 }}>
              {step.exercise.steps.map((s, si) => (
                <li key={si} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.72rem', color: 'var(--accent-primary)', minWidth: 14, paddingTop: 1 }}>{si + 1}</span>
                  {s}
                </li>
              ))}
            </ul>
            {step.exercise.warning && (
              <div style={{
                marginTop: '0.6rem', padding: '0.45rem 0.6rem', background: 'rgba(251,146,60,0.08)',
                borderLeft: '2px solid #FB923C', borderRadius: '0 6px 6px 0', fontSize: '0.78rem', color: '#FB923C',
              }}>
                ⚠️ {step.exercise.warning}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barre d'action fixe — toujours atteignable au pouce sans scroller, même sur petit écran. */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60,
        display: 'flex', gap: '0.6rem', justifyContent: 'center',
        padding: '0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px))',
        background: 'var(--bg-primary)', borderTop: '1px solid var(--border-color)',
        boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
      }}>
        <button type="button" className="btn btn-outline" onClick={goPrev} disabled={index === 0}
          style={{ flex: '0 1 140px', padding: '0.75rem 1rem', opacity: index === 0 ? 0.4 : 1 }}>
          Précédent
        </button>
        <button type="button" className="btn btn-outline" onClick={goNext}
          style={{
            flex: '1 1 220px', padding: '0.75rem 1rem', fontWeight: 700, fontSize: '1rem',
            borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)',
            backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)',
          }}>
          {step.kind === 'rest' ? 'Passer le repos' : 'Suivant'}
        </button>
      </div>
    </div>
  );
}

interface SessionInputProps {
  onStart: (items: SessionItemInput[]) => void;
}

/** Formulaire de saisie du programme JSON (fourni par un Claude perso, référence les #N des cartes ci-dessus). */
function SessionInput({ onStart }: SessionInputProps) {
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [showReference, setShowReference] = useState(false);

  const handleGenerate = () => {
    const result = parseSessionInput(text);
    if ('errors' in result) { setErrors(result.errors); return; }
    setErrors([]);
    onStart(result.items);
  };

  return (
    <div style={{ padding: '1.5rem' }}>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
        Colle ici le programme généré par ton Claude perso — un tableau JSON référençant les numéros
        d'exercices (#N, visibles dans l'onglet Liste).
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
        {DEFAULT_SEANCES.map(s => (
          <button key={s.key} type="button"
            onClick={() => { setText(JSON.stringify(s.items, null, 2)); setErrors([]); }}
            style={{
              padding: '0.4rem 0.85rem', borderRadius: 999, border: '1px solid var(--accent-primary)',
              background: 'transparent', color: 'var(--accent-primary)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
            }}>
            Charger {s.label}
          </button>
        ))}
      </div>

      <button type="button" onClick={() => setShowReference(v => !v)}
        style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: '0.75rem' }}>
        {showReference ? 'Masquer' : 'Afficher'} le format attendu + la liste des numéros
      </button>

      {showReference && (
        <div style={{ marginBottom: '1rem' }}>
          <pre style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
            padding: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)', overflowX: 'auto', marginBottom: '0.75rem',
          }}>
            {SESSION_FORMAT_EXAMPLE}
          </pre>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
            "reps" (répétitions) OU "durationSec" (maintien chronométré) — jamais les deux. Repos en secondes, optionnels (défauts : {DEFAULT_REST_BETWEEN_SETS}s entre séries, {DEFAULT_REST_AFTER_EXERCISE}s entre exercices).
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.3rem',
            maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.6rem',
          }}>
            {EXERCISES.map((ex, i) => (
              <div key={ex.name} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.4rem' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-tertiary)', minWidth: '2em' }}>#{i + 1}</span>
                {ex.name}
              </div>
            ))}
          </div>
        </div>
      )}

      <textarea value={text} onChange={e => setText(e.target.value)}
        placeholder={SESSION_FORMAT_EXAMPLE}
        rows={10}
        style={{
          width: '100%', fontFamily: 'monospace', fontSize: '0.8rem', padding: '0.75rem',
          background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
          color: 'var(--text-primary)', resize: 'vertical',
        }}
      />

      {errors.length > 0 && (
        <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.75rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)' }}>
          {errors.map((err, i) => (
            <div key={i} style={{ fontSize: '0.78rem', color: '#ef4444' }}>{err}</div>
          ))}
        </div>
      )}

      <button type="button" onClick={handleGenerate} disabled={!text.trim()}
        style={{
          marginTop: '1rem', padding: '0.65rem 1.4rem', fontWeight: 700, fontSize: '0.85rem',
          border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-sm)',
          background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)', color: 'var(--accent-primary)',
          cursor: text.trim() ? 'pointer' : 'default', opacity: text.trim() ? 1 : 0.5,
        }}
      >
        Générer la séance
      </button>
    </div>
  );
}

interface SessionSummaryProps {
  items: SessionItemInput[];
  onConfirm: () => void;
  onBack: () => void;
}

/** Récapitulatif de la séance générée — affiché avant de lancer le lecteur pas-à-pas. */
function SessionSummary({ items, onConfirm, onBack }: SessionSummaryProps) {
  const totalSets = items.reduce((sum, item) => sum + item.series, 0);

  return (
    <div style={{ padding: '1.5rem' }}>
      <h3 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.3rem' }}>
        Résumé de la séance
      </h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', margin: '0 0 1rem' }}>
        {items.length} exercice{items.length > 1 ? 's' : ''} · {totalSets} série{totalSets > 1 ? 's' : ''} au total
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
        {items.map((item, i) => {
          const exercise = EXERCISES[item.id - 1];
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 0.75rem',
              background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: CATEGORY_COLORS[exercise.category], flexShrink: 0 }} />
              <span style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                #{item.id}
              </span>
              <span style={{ flex: 1, fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                {exercise.name}
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {item.series} × {item.reps !== undefined ? `${item.reps} reps` : `${item.durationSec}s`}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button type="button" className="btn btn-outline" onClick={onBack} style={{ flex: '0 1 140px', padding: '0.7rem 1rem' }}>
          Modifier
        </button>
        <button type="button" onClick={onConfirm}
          style={{
            flex: '1 1 220px', padding: '0.7rem 1rem', fontWeight: 700, fontSize: '0.9rem',
            border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-sm)',
            background: 'color-mix(in srgb, var(--accent-primary) 10%, transparent)', color: 'var(--accent-primary)',
            cursor: 'pointer',
          }}>
          Commencer la séance
        </button>
      </div>
    </div>
  );
}

interface Props {
  onClose: () => void;
}

/**
 * Page "Renforcement trail" — importée depuis un artefact Claude.ai personnel de Greg (programme
 * de renforcement KB 12kg/élastiques/poids de corps, catégories chaîne postérieure/quadriceps/
 * stabilité/chevilles/tronc/pliométrie). Contenu statique, indépendant du reste de l'app (pas de
 * données GPX) — accessible via un bouton dédié dans le header, sur le modèle d'AthletePage.tsx.
 */
export function StrengthTraining({ onClose }: Props) {
  const [mode, setMode] = useState<'list' | 'session'>('list');
  const [filter, setFilter] = useState<Filter>('intact');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [pendingItems, setPendingItems] = useState<SessionItemInput[] | null>(null);
  const [sessionSteps, setSessionSteps] = useState<SessionStep[] | null>(null);

  const visible = EXERCISES
    .map((ex, i) => ({ ex, i }))
    .filter(({ ex }) => {
      if (filter === 'all') return true;
      if (filter === 'intact') return !!ex.intact;
      return ex.category === filter;
    });

  // Pendant une séance active, la chrome habituelle (titre, sous-titre matériel, onglets) est masquée
  // pour laisser toute la hauteur dispo au minuteur/reps + bouton Suivant sur petit écran — le lecteur
  // a sa propre barre "Quitter la séance" + progression.
  const isRunningSession = mode === 'session' && sessionSteps !== null;

  return (
    <div className="card animate-slide-up" style={{ padding: 0, overflow: 'hidden' }}>
      {!isRunningSession && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)',
          }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              <Dumbbell size={20} style={{ color: 'var(--accent-primary)' }} />
              Renforcement trail
            </h2>
            <button type="button" className="btn btn-outline" onClick={onClose}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}>
              <X size={15} />
              <span className="btn-text">Fermer</span>
            </button>
          </div>

          <div style={{ padding: '0.85rem 1.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
            KB 12kg · Élastiques · Tapis · Chaise · Escalier · Poids de corps
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
            <button type="button" onClick={() => { setMode('list'); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', borderRadius: 999,
                border: `1px solid ${mode === 'list' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                background: mode === 'list' ? 'color-mix(in srgb, var(--accent-primary) 10%, transparent)' : 'transparent',
                color: mode === 'list' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              }}>
              <ListChecks size={14} /> Liste
            </button>
            <button type="button" onClick={() => { setMode('session'); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.9rem', borderRadius: 999,
                border: `1px solid ${mode === 'session' ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                background: mode === 'session' ? 'color-mix(in srgb, var(--accent-primary) 10%, transparent)' : 'transparent',
                color: mode === 'session' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              }}>
              <Timer size={14} /> Séance
            </button>
          </div>
        </>
      )}

      {mode === 'session' ? (
        sessionSteps ? (
          <SessionRunner steps={sessionSteps} onExit={() => { setSessionSteps(null); setPendingItems(null); }} onClosePage={onClose} />
        ) : pendingItems ? (
          <SessionSummary
            items={pendingItems}
            onBack={() => setPendingItems(null)}
            onConfirm={() => setSessionSteps(buildSessionSteps(pendingItems))}
          />
        ) : (
          <SessionInput onStart={items => setPendingItems(items)} />
        )
      ) : (
      <>
      <div style={{ display: 'flex', gap: '0.6rem', padding: '0.75rem 1.5rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)' }}>
        {(Object.keys(CATEGORY_LABELS) as Category[]).map(cat => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: CATEGORY_COLORS[cat] }} />
            {CATEGORY_LABELS[cat]}
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex', gap: '0.4rem', padding: '0.85rem 1.5rem', overflowX: 'auto', borderBottom: '1px solid var(--border-color)',
        // Fondu aux bords — signale qu'il y a d'autres filtres à faire défiler horizontalement (mobile).
        maskImage: 'linear-gradient(to right, transparent, black 1.5rem, black calc(100% - 1.5rem), transparent)',
        WebkitMaskImage: 'linear-gradient(to right, transparent, black 1.5rem, black calc(100% - 1.5rem), transparent)',
      }}>
        {FILTERS.map(f => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)}
            style={{
              flexShrink: 0, padding: '0.35rem 0.85rem', borderRadius: 999,
              border: `1px solid ${filter === f.key ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              background: filter === f.key ? 'color-mix(in srgb, var(--accent-primary) 10%, transparent)' : 'transparent',
              color: filter === f.key ? 'var(--accent-primary)' : 'var(--text-secondary)',
              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '0.85rem 1rem 2rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
        {visible.map(({ ex, i }) => {
          const isOpen = openIndex === i;
          return (
            <div key={ex.name} style={{
              background: 'var(--bg-secondary)', border: `1px solid ${isOpen ? 'var(--accent-primary)' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-md)', overflow: 'hidden',
            }}>
              <button type="button" onClick={() => setOpenIndex(isOpen ? null : i)}
                style={{
                  width: '100%', display: 'flex', flexDirection: 'column', gap: '0.4rem',
                  padding: '0.8rem 0.9rem', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: CATEGORY_COLORS[ex.category], flexShrink: 0 }} />
                  <span style={{
                    flexShrink: 0, fontSize: '0.72rem', fontWeight: 700, fontFamily: 'monospace',
                    color: 'var(--text-tertiary)', minWidth: '1.8em',
                  }}>
                    #{i + 1}
                  </span>
                  <span style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {ex.name}
                  </span>
                  <ChevronDown size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                </div>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', paddingLeft: '1.65rem' }}>
                  {ex.intact && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.3px', background: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)', color: 'var(--accent-primary)' }}>
                      Intouchable
                    </span>
                  )}
                  <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.3px', background: 'color-mix(in srgb, var(--text-tertiary) 12%, transparent)', color: 'var(--text-tertiary)' }}>
                    {ex.material}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border-color)', padding: '0.9rem' }}>
                  <div style={{
                    background: 'color-mix(in srgb, var(--accent-primary) 6%, transparent)',
                    borderLeft: '2px solid var(--accent-primary)', padding: '0.5rem 0.65rem',
                    borderRadius: '0 6px 6px 0', fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '0.75rem',
                  }}>
                    {ex.prescription}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: '0.9rem', alignItems: 'start' }}>
                    <div>
                      <div style={{ fontSize: '0.65rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: '0.4rem' }}>
                        Exécution
                      </div>
                      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: 0, margin: 0 }}>
                        {ex.steps.map((step, si) => (
                          <li key={si} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            <span style={{ fontWeight: 700, fontSize: '0.72rem', color: 'var(--accent-primary)', minWidth: 14, paddingTop: 1 }}>{si + 1}</span>
                            {step}
                          </li>
                        ))}
                      </ul>
                      {ex.warning && (
                        <div style={{
                          marginTop: '0.6rem', padding: '0.45rem 0.6rem', background: 'rgba(251,146,60,0.08)',
                          borderLeft: '2px solid #FB923C', borderRadius: '0 6px 6px 0', fontSize: '0.78rem', color: '#FB923C',
                        }}>
                          ⚠️ {ex.warning}
                        </div>
                      )}
                      <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(ex.youtubeQuery)}`}
                        target="_blank" rel="noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.65rem',
                          background: 'rgba(255,0,0,0.1)', border: '1px solid rgba(255,0,0,0.22)', borderRadius: 6,
                          color: '#FF6B6B', fontSize: '0.75rem', fontWeight: 500, textDecoration: 'none', marginTop: '0.65rem', width: 'fit-content',
                        }}
                      >
                        <Play size={14} />
                        Voir la vidéo
                      </a>
                    </div>
                    <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: '0.6rem' }}>
                      <PoseAnimator frames={ex.frames} svgLabel={ex.svgLabel} view={ex.view} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}
