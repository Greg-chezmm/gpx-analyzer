# Notes de reprise du projet

Pense-bête pour reprendre ce projet sur une autre machine — config locale et
explication de la fonctionnalité "segments" ajoutée récemment.

## Configuration locale sur une nouvelle machine

```bash
git pull
npm install
cp .env.local.example .env.local
```

Puis remplir `.env.local` (jamais commité — `.gitignore` via `*.local`) :

- **Firebase** (`VITE_FIREBASE_*`) : console Firebase (console.firebase.google.com)
  → projet `gpx-analyzer-c06da` → ⚙️ Paramètres du projet → Général →
  section "Vos applications" → config de l'app web.
- **Google Drive** (`VITE_GOOGLE_CLIENT_ID`) : console Google Cloud
  (console.cloud.google.com) → même projet `gpx-analyzer-c06da` → APIs et
  services → Identifiants → l'ID client OAuth de type "Application Web".
  Vérifier que `http://localhost:5173` (et 5174 si besoin) est dans les
  origines JavaScript autorisées.

`npm run dev` ensuite. Le site déployé (`https://greg-chezmm.github.io/gpx-analyzer/`)
utilise les mêmes valeurs mais via des **secrets GitHub** (Settings → Secrets
and variables → Actions), transmis au build par `.github/workflows/deploy.yml` —
déjà configurés, rien à refaire pour déployer (`git push` sur `main` suffit).

## Fonctionnalité "segments récurrents"

Deux mécanismes complémentaires pour repérer des tronçons de tracé déjà
parcourus (façon segments Strava) et suivre sa progression dessus :

### 1. Détection automatique (`RecurringSegments`)
Compare l'activité ouverte à l'historique cloud pour *découvrir* des
tronçons récurrents (regroupement de correspondances). Pas de persistance —
tout est recalculé à chaque clic sur "Analyser l'historique".

### 2. Segments manuels (`StoredSegments`)
Tronçon défini une fois par l'utilisateur (deux clics — carte **ou**
graphique altitude/allure/etc.) puis persisté sur Firestore
(`users/{uid}/segments`). Différenciés par type d'activité (course/vélo).

**Cache du classement** (ajouté pour éviter de rescanner tout l'historique
à chaque fois) :
- Le top 10 est stocké directement sur le document du segment
  (`StoredSegment.attempts`).
- Scan complet automatique une seule fois, à la création du segment.
- Chaque nouvelle activité sauvegardée est comparée **en mémoire** (pas de
  téléchargement) aux segments existants et met à jour leur classement
  incrémentalement — voir `App.tsx` → `mergeIntoStoredSegments()`.
- Le bouton "Comparer" devient "Actualiser" une fois un cache présent, pour
  relancer un scan complet à la demande seulement (utile si on ajoute
  beaucoup d'anciennes activités d'un coup).

### Où ça vit dans le code
| Fichier | Rôle |
|---|---|
| `src/utils/segments.ts` | Algorithme : empreinte geohash (pré-filtrage), matching géométrique (corridor + cap), regroupement, cache/affichage. |
| `src/hooks/useRecurringSegments.ts` | Orchestration du scan auto. |
| `src/hooks/useStoredSegments.ts` | Liste/CRUD des segments manuels (Firestore). |
| `src/hooks/useStoredSegmentScan.ts` | Scan complet d'un segment manuel contre l'historique. |
| `src/hooks/useSegmentPicker.ts` | État de la sélection à deux clics (carte/graphique). |
| `src/components/RecurringSegments.tsx` | Panneau détection auto. |
| `src/components/StoredSegments.tsx` | Panneau segments manuels + formulaire de création. |

### Réglages principaux (à ajuster empiriquement si besoin)
- Tolérance de corridor : 30 m · tolérance de cap : ±55° (`utils/segments.ts`)
- Distance minimale d'un segment auto-détecté : 300 m (segments manuels :
  60% de leur propre longueur, min 100 m)
- Plafond de candidats comparés par scan : 20 (`MAX_CANDIDATES`)
- Taille du classement mis en cache : 10 (`TOP_N`)
