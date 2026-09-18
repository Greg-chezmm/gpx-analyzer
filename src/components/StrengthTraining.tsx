import { useState, useEffect, type ReactNode } from "react";
import { X, Dumbbell, ChevronDown, Play, Pause, ListChecks, Timer } from "lucide-react";
import stepDownGif from "../assets/exercises/edb/step-down.gif";
import sideLungeGif from "../assets/exercises/edb/side-lunge.gif";
import plankArmRaiseGif from "../assets/exercises/edb/plank-arm-raise.gif";
import abduction1 from "../assets/exercises/edb/abduction-1.jpg";
import abduction2 from "../assets/exercises/edb/abduction-2.jpg";
import romanianDeadliftGif from "../assets/exercises/edb/romanian-deadlift.gif";
import pallofPressGif from "../assets/exercises/edb/pallof-press.gif";
import gluteBridgeGif from "../assets/exercises/edb/glute-bridge.gif";
import kbSwingGif from "../assets/exercises/edb/kb-swing.gif";
import squatBulgareGif from "../assets/exercises/edb/squat-bulgare.gif";
import walkingLungeGif from "../assets/exercises/edb/walking-lunge.gif";
import squatPauseGif from "../assets/exercises/edb/squat-pause.gif";
import monsterWalkGif from "../assets/exercises/edb/monster-walk.gif";
import squatJumpGif from "../assets/exercises/edb/squat-jump.gif";
import lungeJumpGif from "../assets/exercises/edb/lunge-jump.gif";
import nordicCurlGif from "../assets/exercises/edb/nordic-curl.gif";
import calfRaiseStaircaseGif from "../assets/exercises/edb/calf-raise-staircase.gif";
import calfRaiseSingleLegGif from "../assets/exercises/edb/calf-raise-single-leg.gif";
import clamshellGif from "../assets/exercises/edb/clamshell.gif";
import birdDogGif from "../assets/exercises/edb/bird-dog.gif";
import plankGif from "../assets/exercises/edb/plank.gif";
import sidePlankDynamicGif from "../assets/exercises/edb/side-plank-dynamic.gif";
import deadBugGif from "../assets/exercises/edb/dead-bug.gif";

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
  /** Décomposition du mouvement en 4 poses minimum (chacune un <svg> autoporteur, viewBox propre à
   * l'exercice), lues en boucle par PoseAnimator (bouton lecture) pour visualiser l'enchaînement.
   * La plupart des exercices en ont exactement 4 ; certains (ex. Step-down, décrit en 5 étapes dans
   * `steps`) en ont une de plus pour un repère supplémentaire (alignement, erreur à éviter, etc.). */
  frames: [ExerciseFrame, ExerciseFrame, ExerciseFrame, ExerciseFrame, ...ExerciseFrame[]];
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
function PoseAnimator({ frames, svgLabel, view, size = 380 }: PoseAnimatorProps) {
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

/** Pose illustrée par une photo/illustration recadrée (plutôt qu'un schéma vectoriel) — utilisé
 * quand une image de référence externe (fournie par Greg) est plus lisible qu'un dessin filaire. */
function ExercisePhoto({ src, alt }: { src: string; alt: string }) {
  return (
    <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }} />
  );
}

interface PlankFrameProps {
  /** Préfixe d'id unique pour les <defs> (filter) de cette pose — évite les collisions d'id SVG entre poses/exercices. */
  frameId: string;
  /** Hauteur du bassin (seul point qui varie d'une pose à l'autre — épaules, coudes/mains et genoux/orteils restent fixes). */
  hipY: number;
  status: 'ok' | 'error';
  labelText: string;
}

/**
 * Schéma de gainage frontal (planche) — vue de côté façon "fiche technique" : fond quadrillé
 * discret, ligne de sol, membres colorés (avant/arrière) avec squelette et nœuds d'articulation
 * ombrés, étiquette de statut. Seul le point de bassin bouge d'une pose à l'autre pour illustrer
 * le bassin trop haut / affaissé par rapport à la position correcte (droite).
 * Inspiré d'un schéma fourni par Greg, adapté à la posture allongée de la planche.
 */
function PlankFrame({ frameId, hipY, status, labelText }: PlankFrameProps) {
  const spineColor = status === 'ok' ? ACCENT : '#ef4444';
  const jointAccent = status === 'ok' ? '#1e293b' : '#ef4444';
  const shoulder = { x: 95, y: 92 };
  const hip = { x: 300, y: hipY };

  return (
    <svg viewBox="0 0 500 260" width="100%" height="100%">
      <defs>
        <filter id={`${frameId}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.18" />
        </filter>
      </defs>

      <rect width="500" height="260" fill="#f8f9fa" rx="12" />
      <g stroke="#e2e8f0" strokeWidth="1" strokeDasharray="4 4">
        <line x1="30" y1="60" x2="470" y2="60" />
        <line x1="30" y1="120" x2="470" y2="120" />
        <line x1="30" y1="180" x2="470" y2="180" />
        <line x1="150" y1="20" x2="150" y2="240" />
        <line x1="330" y1="20" x2="330" y2="240" />
      </g>
      {/* Ligne guide — hauteur de bassin idéale (alignement tête-épaules-hanches-talons) */}
      <line x1="30" y1="100" x2="470" y2="100" stroke="#06B6D4" strokeWidth="1" strokeDasharray="3,2" opacity="0.35" />
      {/* Sol */}
      <line x1="30" y1="205" x2="465" y2="205" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />

      {/* Bras arrière (orange) — en profondeur, derrière le torse */}
      <line x1="97" y1="96" x2="108" y2="158" stroke="#fed7aa" strokeWidth="12" strokeLinecap="round" />
      <line x1="108" y1="158" x2="165" y2="205" stroke="#fed7aa" strokeWidth="12" strokeLinecap="round" />
      <line x1="97" y1="96" x2="108" y2="158" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" />
      <line x1="108" y1="158" x2="165" y2="205" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" />

      {/* Jambe arrière (verte) — en profondeur */}
      <line x1={hip.x} y1={hip.y + 6} x2="400" y2="158" stroke="#bbf7d0" strokeWidth="14" strokeLinecap="round" />
      <line x1="400" y1="158" x2="450" y2="205" stroke="#bbf7d0" strokeWidth="14" strokeLinecap="round" />
      <line x1={hip.x} y1={hip.y + 6} x2="400" y2="158" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" />
      <line x1="400" y1="158" x2="450" y2="205" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" />

      {/* Tête */}
      <circle cx="75" cy="65" r="22" fill="#e2e8f0" stroke="#475569" strokeWidth="2" />
      <path d="M 65 68 Q 75 76 85 68" fill="none" stroke="#475569" strokeWidth="1.5" />
      <circle cx="80" cy="72" r="1.6" fill="#475569" />

      {/* Torse — ligne de dos, indicateur principal droit/plié */}
      <line x1={shoulder.x} y1={shoulder.y} x2={hip.x} y2={hip.y} stroke={spineColor} strokeWidth="10" strokeLinecap="round" />

      {/* Bras avant (sarcelle) — appui avant-bras au sol */}
      <line x1={shoulder.x} y1={shoulder.y} x2="92" y2="150" stroke="#99f6e4" strokeWidth="14" strokeLinecap="round" />
      <line x1="92" y1="150" x2="150" y2="205" stroke="#99f6e4" strokeWidth="14" strokeLinecap="round" />
      <line x1={shoulder.x} y1={shoulder.y} x2="92" y2="150" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" />
      <line x1="92" y1="150" x2="150" y2="205" stroke="#0d9488" strokeWidth="2" strokeLinecap="round" />

      {/* Jambe avant (indigo) — pointe de pied au sol */}
      <line x1={hip.x} y1={hip.y} x2="390" y2="150" stroke="#c7d2fe" strokeWidth="16" strokeLinecap="round" />
      <line x1="390" y1="150" x2="438" y2="205" stroke="#c7d2fe" strokeWidth="16" strokeLinecap="round" />
      <line x1={hip.x} y1={hip.y} x2="390" y2="150" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" />
      <line x1="390" y1="150" x2="438" y2="205" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" />

      {/* Nœuds d'articulation */}
      <circle cx={shoulder.x} cy={shoulder.y} r="4.5" fill="#1e293b" filter={`url(#${frameId}-shadow)`} />
      <circle cx={hip.x} cy={hip.y} r="5.5" fill={jointAccent} filter={`url(#${frameId}-shadow)`} />
      <circle cx="92" cy="150" r="4" fill="#0d9488" filter={`url(#${frameId}-shadow)`} />
      <circle cx="150" cy="205" r="3.5" fill="#0d9488" filter={`url(#${frameId}-shadow)`} />
      <circle cx="390" cy="150" r="4" fill="#4f46e5" filter={`url(#${frameId}-shadow)`} />
      <circle cx="438" cy="205" r="3.5" fill="#4f46e5" filter={`url(#${frameId}-shadow)`} />

      {/* Étiquette de statut */}
      <g transform="translate(20, 18)">
        <rect width="185" height="24" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />
        <circle cx="13" cy="12" r="3" fill={spineColor} />
        <text x="22" y="16" fill="#334155" fontFamily="system-ui, sans-serif" fontSize="9.5" fontWeight="700" letterSpacing="0.4">
          {labelText}
        </text>
      </g>
    </svg>
  );
}

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
      { label: 'Charnière de hanche — dos plat', svg: <ExercisePhoto src={romanianDeadliftGif} alt="Romanian Deadlift — animation du mouvement complet" /> },
      { label: 'Charnière de hanche — dos plat', svg: <ExercisePhoto src={romanianDeadliftGif} alt="Romanian Deadlift — animation du mouvement complet" /> },
      { label: 'Charnière de hanche — dos plat', svg: <ExercisePhoto src={romanianDeadliftGif} alt="Romanian Deadlift — animation du mouvement complet" /> },
      { label: 'Charnière de hanche — dos plat', svg: <ExercisePhoto src={romanianDeadliftGif} alt="Romanian Deadlift — animation du mouvement complet" /> },
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
      { label: 'Bassin aligné — jambe libre tendue', svg: <ExercisePhoto src={gluteBridgeGif} alt="Pont fessier unilatéral — animation du mouvement complet" /> },
      { label: 'Bassin aligné — jambe libre tendue', svg: <ExercisePhoto src={gluteBridgeGif} alt="Pont fessier unilatéral — animation du mouvement complet" /> },
      { label: 'Bassin aligné — jambe libre tendue', svg: <ExercisePhoto src={gluteBridgeGif} alt="Pont fessier unilatéral — animation du mouvement complet" /> },
      { label: 'Bassin aligné — jambe libre tendue', svg: <ExercisePhoto src={gluteBridgeGif} alt="Pont fessier unilatéral — animation du mouvement complet" /> },
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
      { label: 'Corps rigide — résister avec les ischios (démo sur banc GHD — chez toi : chevilles sous un meuble)', svg: <ExercisePhoto src={nordicCurlGif} alt="Nordic Curl — animation du mouvement complet (variante machine)" /> },
      { label: 'Corps rigide — résister avec les ischios (démo sur banc GHD — chez toi : chevilles sous un meuble)', svg: <ExercisePhoto src={nordicCurlGif} alt="Nordic Curl — animation du mouvement complet (variante machine)" /> },
      { label: 'Corps rigide — résister avec les ischios (démo sur banc GHD — chez toi : chevilles sous un meuble)', svg: <ExercisePhoto src={nordicCurlGif} alt="Nordic Curl — animation du mouvement complet (variante machine)" /> },
      { label: 'Corps rigide — résister avec les ischios (démo sur banc GHD — chez toi : chevilles sous un meuble)', svg: <ExercisePhoto src={nordicCurlGif} alt="Nordic Curl — animation du mouvement complet (variante machine)" /> },
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
      { label: 'Impulsion des hanches — pas des bras', svg: <ExercisePhoto src={kbSwingGif} alt="KB Swing — animation du mouvement complet" /> },
      { label: 'Impulsion des hanches — pas des bras', svg: <ExercisePhoto src={kbSwingGif} alt="KB Swing — animation du mouvement complet" /> },
      { label: 'Impulsion des hanches — pas des bras', svg: <ExercisePhoto src={kbSwingGif} alt="KB Swing — animation du mouvement complet" /> },
      { label: 'Impulsion des hanches — pas des bras', svg: <ExercisePhoto src={kbSwingGif} alt="KB Swing — animation du mouvement complet" /> },
    ],
  },
  {
    name: 'Step-down excentrique', category: 'quad', material: 'Escalier (marche 15-20cm)', intact: true,
    prescription: '3-4 × 10 chaque jambe — descente en 4 secondes — exercice clé descentes trail',
    steps: [
      "Marche d'escalier 15-20cm (pas une chaise) — talon au bord dans le vide",
      "Jambe libre tendue vers l'avant dans le vide — pas vers l'arrière",
      "Main légèrement posée sur le mur pour l'équilibre — sans s'y appuyer, corps droit, regard devant",
      "Descendre en fléchissant la jambe d'appui — 4 secondes, très lent",
      "Le talon de la jambe libre descend jusqu'à effleurer le sol — sans y poser le poids",
      "Remonter en 1 seconde en poussant sur le talon de la jambe d'appui",
      "Genou d'appui dans l'axe du pied — jamais vers l'intérieur",
    ],
    warning: 'À éviter : descendre vite (toute la valeur est dans les 4 sec) · poser le poids sur la jambe libre · laisser le genou rentrer · s\'appuyer sur le mur',
    youtubeQuery: 'step down excentrique trail genoux',
    svgLabel: "Descente lente 4 sec — genou dans l'axe",
    view: 'côté',
    frames: [
      { label: "Descente lente 4 sec — genou dans l'axe", svg: <ExercisePhoto src={stepDownGif} alt="Step-down excentrique — animation du mouvement complet" /> },
      { label: "Descente lente 4 sec — genou dans l'axe", svg: <ExercisePhoto src={stepDownGif} alt="Step-down excentrique — animation du mouvement complet" /> },
      { label: "Descente lente 4 sec — genou dans l'axe", svg: <ExercisePhoto src={stepDownGif} alt="Step-down excentrique — animation du mouvement complet" /> },
      { label: "Descente lente 4 sec — genou dans l'axe", svg: <ExercisePhoto src={stepDownGif} alt="Step-down excentrique — animation du mouvement complet" /> },
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
      { label: 'Pied arrière sur chaise — descente verticale (démo haltères)', svg: <ExercisePhoto src={squatBulgareGif} alt="Squat bulgare — animation du mouvement complet" /> },
      { label: 'Pied arrière sur chaise — descente verticale (démo haltères)', svg: <ExercisePhoto src={squatBulgareGif} alt="Squat bulgare — animation du mouvement complet" /> },
      { label: 'Pied arrière sur chaise — descente verticale (démo haltères)', svg: <ExercisePhoto src={squatBulgareGif} alt="Squat bulgare — animation du mouvement complet" /> },
      { label: 'Pied arrière sur chaise — descente verticale (démo haltères)', svg: <ExercisePhoto src={squatBulgareGif} alt="Squat bulgare — animation du mouvement complet" /> },
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
      { label: 'Jambe tendue côté opposé — talon à plat', svg: <ExercisePhoto src={sideLungeGif} alt="Fentes latérales — animation du mouvement complet" /> },
      { label: 'Jambe tendue côté opposé — talon à plat', svg: <ExercisePhoto src={sideLungeGif} alt="Fentes latérales — animation du mouvement complet" /> },
      { label: 'Jambe tendue côté opposé — talon à plat', svg: <ExercisePhoto src={sideLungeGif} alt="Fentes latérales — animation du mouvement complet" /> },
      { label: 'Jambe tendue côté opposé — talon à plat', svg: <ExercisePhoto src={sideLungeGif} alt="Fentes latérales — animation du mouvement complet" /> },
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
      { label: "Genou avant 90° — talon d'abord", svg: <ExercisePhoto src={walkingLungeGif} alt="Fentes marchées — animation du mouvement complet" /> },
      { label: "Genou avant 90° — talon d'abord", svg: <ExercisePhoto src={walkingLungeGif} alt="Fentes marchées — animation du mouvement complet" /> },
      { label: "Genou avant 90° — talon d'abord", svg: <ExercisePhoto src={walkingLungeGif} alt="Fentes marchées — animation du mouvement complet" /> },
      { label: "Genou avant 90° — talon d'abord", svg: <ExercisePhoto src={walkingLungeGif} alt="Fentes marchées — animation du mouvement complet" /> },
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
      { label: 'Position basse tenue — cuisses parallèles', svg: <ExercisePhoto src={squatPauseGif} alt="Squat pause — animation du mouvement complet" /> },
      { label: 'Position basse tenue — cuisses parallèles', svg: <ExercisePhoto src={squatPauseGif} alt="Squat pause — animation du mouvement complet" /> },
      { label: 'Position basse tenue — cuisses parallèles', svg: <ExercisePhoto src={squatPauseGif} alt="Squat pause — animation du mouvement complet" /> },
      { label: 'Position basse tenue — cuisses parallèles', svg: <ExercisePhoto src={squatPauseGif} alt="Squat pause — animation du mouvement complet" /> },
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
      { label: 'Semi-squat — pas latéraux — tension constante', svg: <ExercisePhoto src={monsterWalkGif} alt="Monster walk — animation du mouvement complet" /> },
      { label: 'Semi-squat — pas latéraux — tension constante', svg: <ExercisePhoto src={monsterWalkGif} alt="Monster walk — animation du mouvement complet" /> },
      { label: 'Semi-squat — pas latéraux — tension constante', svg: <ExercisePhoto src={monsterWalkGif} alt="Monster walk — animation du mouvement complet" /> },
      { label: 'Semi-squat — pas latéraux — tension constante', svg: <ExercisePhoto src={monsterWalkGif} alt="Monster walk — animation du mouvement complet" /> },
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
      { label: 'Départ (jambe au sol)', svg: <ExercisePhoto src={abduction1} alt="Abduction debout élastique — position départ" /> },
      { label: 'Haut — maintien 1 sec', svg: <ExercisePhoto src={abduction2} alt="Abduction debout élastique — jambe levée sur le côté" /> },
      { label: 'Haut — maintien 1 sec', svg: <ExercisePhoto src={abduction2} alt="Abduction debout élastique — jambe levée sur le côté" /> },
      { label: 'Départ (jambe au sol)', svg: <ExercisePhoto src={abduction1} alt="Abduction debout élastique — position départ" /> },
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
      { label: 'Genou du dessus s’ouvre — talons joints', svg: <ExercisePhoto src={clamshellGif} alt="Clamshell élastique — animation du mouvement complet" /> },
      { label: 'Genou du dessus s’ouvre — talons joints', svg: <ExercisePhoto src={clamshellGif} alt="Clamshell élastique — animation du mouvement complet" /> },
      { label: 'Genou du dessus s’ouvre — talons joints', svg: <ExercisePhoto src={clamshellGif} alt="Clamshell élastique — animation du mouvement complet" /> },
      { label: 'Genou du dessus s’ouvre — talons joints', svg: <ExercisePhoto src={clamshellGif} alt="Clamshell élastique — animation du mouvement complet" /> },
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
      { label: 'Montée 2 pieds — descente 1 pied lente (sur escalier)', svg: <ExercisePhoto src={calfRaiseStaircaseGif} alt="Mollets excentriques — animation du mouvement complet" /> },
      { label: 'Montée 2 pieds — descente 1 pied lente (sur escalier)', svg: <ExercisePhoto src={calfRaiseStaircaseGif} alt="Mollets excentriques — animation du mouvement complet" /> },
      { label: 'Montée 2 pieds — descente 1 pied lente (sur escalier)', svg: <ExercisePhoto src={calfRaiseStaircaseGif} alt="Mollets excentriques — animation du mouvement complet" /> },
      { label: 'Montée 2 pieds — descente 1 pied lente (sur escalier)', svg: <ExercisePhoto src={calfRaiseStaircaseGif} alt="Mollets excentriques — animation du mouvement complet" /> },
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
      { label: 'Unilatéral — amplitude complète talon (démo au sol — chez toi : sur une marche)', svg: <ExercisePhoto src={calfRaiseSingleLegGif} alt="Single leg calf raise — animation du mouvement complet" /> },
      { label: 'Unilatéral — amplitude complète talon (démo au sol — chez toi : sur une marche)', svg: <ExercisePhoto src={calfRaiseSingleLegGif} alt="Single leg calf raise — animation du mouvement complet" /> },
      { label: 'Unilatéral — amplitude complète talon (démo au sol — chez toi : sur une marche)', svg: <ExercisePhoto src={calfRaiseSingleLegGif} alt="Single leg calf raise — animation du mouvement complet" /> },
      { label: 'Unilatéral — amplitude complète talon (démo au sol — chez toi : sur une marche)', svg: <ExercisePhoto src={calfRaiseSingleLegGif} alt="Single leg calf raise — animation du mouvement complet" /> },
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
        svg: <ExercisePhoto src={plankGif} alt="Gainage frontal — position correcte, corps aligné" />,
      },
      {
        label: 'Erreur à éviter — bassin trop haut',
        svg: <PlankFrame frameId="gf-2" hipY={55} status="error" labelText="ERREUR — BASSIN HAUT" />,
      },
      {
        label: 'Erreur à éviter — bassin qui s’affaisse',
        svg: <PlankFrame frameId="gf-3" hipY={165} status="error" labelText="ERREUR — BASSIN BAS" />,
      },
      {
        label: 'Retour à la position correcte',
        svg: <ExercisePhoto src={plankGif} alt="Gainage frontal — retour à la position correcte" />,
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
      { label: 'Bras tendu — bassin immobile', svg: <ExercisePhoto src={plankArmRaiseGif} alt="Gainage frontal + extension bras — animation du mouvement complet" /> },
      { label: 'Bras tendu — bassin immobile', svg: <ExercisePhoto src={plankArmRaiseGif} alt="Gainage frontal + extension bras — animation du mouvement complet" /> },
      { label: 'Bras tendu — bassin immobile', svg: <ExercisePhoto src={plankArmRaiseGif} alt="Gainage frontal + extension bras — animation du mouvement complet" /> },
      { label: 'Bras tendu — bassin immobile', svg: <ExercisePhoto src={plankArmRaiseGif} alt="Gainage frontal + extension bras — animation du mouvement complet" /> },
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
      { label: 'Montée/descente du bassin — corps aligné', svg: <ExercisePhoto src={sidePlankDynamicGif} alt="Gainage latéral dynamique — animation du mouvement complet" /> },
      { label: 'Montée/descente du bassin — corps aligné', svg: <ExercisePhoto src={sidePlankDynamicGif} alt="Gainage latéral dynamique — animation du mouvement complet" /> },
      { label: 'Montée/descente du bassin — corps aligné', svg: <ExercisePhoto src={sidePlankDynamicGif} alt="Gainage latéral dynamique — animation du mouvement complet" /> },
      { label: 'Montée/descente du bassin — corps aligné', svg: <ExercisePhoto src={sidePlankDynamicGif} alt="Gainage latéral dynamique — animation du mouvement complet" /> },
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
      { label: 'Dos plaqué — bras/jambe opposés descendent', svg: <ExercisePhoto src={deadBugGif} alt="Dead bug — animation du mouvement complet" /> },
      { label: 'Dos plaqué — bras/jambe opposés descendent', svg: <ExercisePhoto src={deadBugGif} alt="Dead bug — animation du mouvement complet" /> },
      { label: 'Dos plaqué — bras/jambe opposés descendent', svg: <ExercisePhoto src={deadBugGif} alt="Dead bug — animation du mouvement complet" /> },
      { label: 'Dos plaqué — bras/jambe opposés descendent', svg: <ExercisePhoto src={deadBugGif} alt="Dead bug — animation du mouvement complet" /> },
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
      { label: 'Pousser les bras — résister à la rotation', svg: <ExercisePhoto src={pallofPressGif} alt="Pallof press élastique — animation du mouvement complet" /> },
      { label: 'Pousser les bras — résister à la rotation', svg: <ExercisePhoto src={pallofPressGif} alt="Pallof press élastique — animation du mouvement complet" /> },
      { label: 'Pousser les bras — résister à la rotation', svg: <ExercisePhoto src={pallofPressGif} alt="Pallof press élastique — animation du mouvement complet" /> },
      { label: 'Pousser les bras — résister à la rotation', svg: <ExercisePhoto src={pallofPressGif} alt="Pallof press élastique — animation du mouvement complet" /> },
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
      { label: 'Bras et jambe opposés — dos plat', svg: <ExercisePhoto src={birdDogGif} alt="Bird dog — animation du mouvement complet" /> },
      { label: 'Bras et jambe opposés — dos plat', svg: <ExercisePhoto src={birdDogGif} alt="Bird dog — animation du mouvement complet" /> },
      { label: 'Bras et jambe opposés — dos plat', svg: <ExercisePhoto src={birdDogGif} alt="Bird dog — animation du mouvement complet" /> },
      { label: 'Bras et jambe opposés — dos plat', svg: <ExercisePhoto src={birdDogGif} alt="Bird dog — animation du mouvement complet" /> },
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
      { label: 'Impulsion explosive — réception souple', svg: <ExercisePhoto src={squatJumpGif} alt="Squat jump — animation du mouvement complet" /> },
      { label: 'Impulsion explosive — réception souple', svg: <ExercisePhoto src={squatJumpGif} alt="Squat jump — animation du mouvement complet" /> },
      { label: 'Impulsion explosive — réception souple', svg: <ExercisePhoto src={squatJumpGif} alt="Squat jump — animation du mouvement complet" /> },
      { label: 'Impulsion explosive — réception souple', svg: <ExercisePhoto src={squatJumpGif} alt="Squat jump — animation du mouvement complet" /> },
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
      { label: "Échange des jambes en l'air — réception fente", svg: <ExercisePhoto src={lungeJumpGif} alt="Fentes sautées — animation du mouvement complet" /> },
      { label: "Échange des jambes en l'air — réception fente", svg: <ExercisePhoto src={lungeJumpGif} alt="Fentes sautées — animation du mouvement complet" /> },
      { label: "Échange des jambes en l'air — réception fente", svg: <ExercisePhoto src={lungeJumpGif} alt="Fentes sautées — animation du mouvement complet" /> },
      { label: "Échange des jambes en l'air — réception fente", svg: <ExercisePhoto src={lungeJumpGif} alt="Fentes sautées — animation du mouvement complet" /> },
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 410px', gap: '0.9rem', alignItems: 'start' }}>
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
      <div style={{ padding: '0.6rem 1.5rem 1rem', fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
        Illustrations d'exercices : ExerciseDB (oss.exercisedb.dev, usage non-commercial), LitoBox.com, RecoverAthletics.com, Queensland Health (hw.qld.gov.au), DailyBurn et FitCarrots.com.
      </div>
      </>
      )}
    </div>
  );
}
