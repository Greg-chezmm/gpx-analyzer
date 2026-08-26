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

## Fonctionnalités "segments" et "trajets" (mises à jour 2026-08-26)

Trois mécanismes complémentaires, tous basés sur le même moteur de matching
géométrique (`utils/segments.ts`) :

### 1. Segments manuels (`StoredSegments`)
Tronçon défini une fois par l'utilisateur (deux clics — carte **ou**
graphique altitude/allure/etc.) puis persisté sur Firestore
(`users/{uid}/segments`). Différenciés par type d'activité (course/vélo).
Comparaison à sens unique (référence fixe → candidates), corridor continu
requis (`findLongestMatch`, un seul segment = une seule plage).

Seuls les segments dont le tracé est effectivement suivi par l'activité
**actuellement ouverte** sont affichés (`matchStoredSegment` appliqué à
`activity.points` en local, sans téléchargement) — un segment défini sur un
autre parcours (même type d'activité) n'apparaît pas, même s'il a un
classement en cache par ailleurs.

**Cache du classement** (évite de rescanner tout l'historique à chaque fois) :
- Le top 10 est stocké directement sur le document du segment
  (`StoredSegment.attempts`).
- Scan complet automatique une seule fois, à la création du segment.
- Chaque nouvelle activité sauvegardée est comparée **en mémoire** (pas de
  téléchargement) aux segments existants et met à jour leur classement
  incrémentalement — voir `App.tsx` → `mergeIntoStoredSegments()`.
- Le bouton "Comparer" devient "Actualiser" une fois un cache présent, pour
  relancer un scan complet à la demande seulement.
- Un scan complet ("Comparer"/"Actualiser") compare **tout** l'historique
  du même type d'activité, sans plafond — action manuelle explicite, le
  coût réseau est attendu par l'utilisateur (`useStoredSegmentScan.ts`,
  plus de `MAX_CANDIDATES`/`MIN_FINGERPRINT_OVERLAP` d'exclusion).

### 2. Trajets complets — "Ton parcours habituel" (`RouteHistory`)
Détection **automatique et silencieuse** à l'ouverture d'une activité : si
une ou plusieurs activités passées suivent le MÊME trajet complet (pas
juste un tronçon), affiche un classement avec distance/temps/allure-vitesse/
D+/FC — clic sur une ligne pour ouvrir directement cette activité passée
(pas de modale carte séparée). N'affiche rien si aucune correspondance.
Remplace l'ancien "Segments récurrents" (détection partielle, jamais
persistée), supprimé.

- **Comparaison symétrique par couverture** : chaque activité doit couvrir
  ≥90% de l'autre (`FULL_ROUTE_COVERAGE` dans `segments.ts`) — évite qu'une
  boucle courte soit "contenue" dans une boucle 2x plus longue (~25% de
  recouvrement, largement sous le seuil), tout en acceptant qu'un même
  trajet soit interrompu par un court détour (~500m sur ~19km → ~97%).
  Seuil calibré empiriquement sur l'historique réel de Greg (vélotaf) :
  une variante "rallongée" de ~4km sur ~22km (~80-82%) ne doit PAS matcher
  (route distincte), un détour ponctuel de 500m doit matcher.
- **Sens de parcours** : uniquement le même sens (le cap ±55° de
  `findLongestMatch` exclut déjà les allers-retours) — sens inverse
  explicitement écarté à la demande de Greg, pas de comparaison miroir.
- **Recollage de corridors fragmentés** (`computeTotalCoverage`) :
  additionne TOUS les corridors communs trouvés entre deux tracés, pas
  seulement le plus long — un même trajet réel peut être coupé en
  plusieurs morceaux par un détour ponctuel ou une coupure GPS, sans
  perdre la couverture des portions avant/après. `findLongestMatch`
  (segments manuels) reste inchangé, garde un seul corridor continu par
  design (une montée n'est pas coupable en deux par un détour).
- **Panneau de diagnostic** (repliable, sous le tableau) : liste les
  candidates plausibles (distance+empreinte proches) mais écartées à la
  vérification géométrique, avec la raison précise (aucun corridor commun
  / recouvrement insuffisant + les deux pourcentages). Très utile pour
  calibrer les seuils avec de vraies données plutôt qu'à l'aveugle.
- **Scan complet sans plafond + cache Firestore** (`useFullRouteMatches.ts`) :
  compare tout l'historique du même type (seul le ratio de distance ±30%
  pré-filtre — plus d'exclusion par empreinte ni de `MAX_CANDIDATES`). Le
  résultat est persisté sur `ActivityIndexEntry.routeMatchIds` +
  `routeMatchScannedAt`, **réciproquement sur chaque activité du groupe**
  trouvé (via `cloud.updateActivityMetaBatch`, une seule mise à jour locale,
  pas de refetch complet) — la prochaine ouverture de n'importe laquelle de
  ces activités réutilise le cache instantanément (aucun téléchargement).
  Bouton "Actualiser" dans `RouteHistory.tsx` pour forcer un nouveau scan.

### 3. Empreinte géographique — pré-filtrage partagé
Un geohash (précision 7, ~150m) calculé pour des points tous les ~25m,
stocké sur `ActivityIndexEntry.fingerprint`. Sert de pré-filtrage bon
marché (aucun téléchargement) avant le matching géométrique précis, pour
les deux fonctionnalités ci-dessus.
- **Absent sur les activités migrées depuis Drive** (avant l'ajout de
  cette fonctionnalité) — bouton **"Calculer les empreintes (N)"** dans le
  panneau Activités cloud (`CloudSync.tsx`) pour un rétro-calcul en masse
  (un seul téléchargement par activité recalcule aussi meilleurs efforts +
  zones FC au passage). Les activités sans empreinte ne sont PAS exclues
  du matching (juste reléguées en priorité basse), pour ne pas ignorer
  silencieusement tout l'historique migré en attendant ce rétro-calcul.

### Où ça vit dans le code
| Fichier | Rôle |
|---|---|
| `src/utils/segments.ts` | Empreinte geohash, `computeRuns`/`findLongestMatch` (segment, un seul corridor)/`computeTotalCoverage` (trajet complet, somme des corridors), `matchStoredSegment`, `matchFullRoute`, `debugRouteCoverage`. |
| `src/hooks/useFullRouteMatches.ts` | Orchestration du scan auto "trajet habituel" + diagnostic des candidates écartées. |
| `src/hooks/useStoredSegments.ts` | Liste/CRUD des segments manuels (Firestore). |
| `src/hooks/useStoredSegmentScan.ts` | Scan complet d'un segment manuel contre l'historique. |
| `src/hooks/useSegmentPicker.ts` | État de la sélection à deux clics (carte/graphique). |
| `src/components/RouteHistory.tsx` | Panneau "Ton parcours habituel" + diagnostic repliable. |
| `src/components/StoredSegments.tsx` | Panneau segments manuels + formulaire de création. |

### Réglages principaux (à ajuster empiriquement si besoin)
- Tolérance de corridor : 30 m · tolérance de cap : ±55° (`utils/segments.ts`)
- Distance minimale d'un segment manuel : 60% de sa propre longueur, min 100 m
- Distance minimale d'UN run pour un trajet complet : 40 m (`MIN_ROUTE_RUN_DISTANCE_M`,
  volontairement bas car on additionne plusieurs runs)
- Seuil de couverture trajet complet : 90% de chaque côté (`FULL_ROUTE_COVERAGE`)
- Taille du classement mis en cache (segments manuels) : 10 (`TOP_N`)
- Pas de plafond de candidats scannés (segments manuels et trajets complets) — un scan complet
  compare tout l'historique du même type d'activité (2026-08-26)

## Résumé IA — adapté par type d'activité (2026-08-26)

`generateSummary.ts` génère un contenu différent selon le type de séance, pour éviter le bruit
(métriques peu fiables, doublons avec le contexte de conversation) :
- **Vélo** : distance/vitesse+max/D+D-/FC/cadence, zones cardiaques, CTL/ATL/TSB, TRIMP Banister,
  dérive cardiaque, météo (temp+vent), ressenti athlète. Pas de fractionnés ni splits.
- **Course (footing/trail)** : idem + allure moyenne + splits par km (allure+FC uniquement).
- **Course avec fractionnés issus du `.fit`** (`hasStructuredIntervals()` : laps `.fit` présents —
  pas la détection heuristique par vitesse, qui peut se déclencher sur un trail vallonné — ET
  chaque répétition ≤ 30 min, sinon un lap pause/étape sur une sortie longue serait pris pour un
  intervalle, ex. SL 21 km à 2 laps dont un de 2h01) : splits remplacés par un détail par
  répétition (durée, distance, VAM, FC moy/max, allure).
- **Retiré pour tous les types** : profil athlète (FCmax/VMA/FTP/poids — redondant avec le contexte
  de conversation), TRIMP Edwards, récupération estimée TRIMP/10, TSS/EPOC/Training
  Effect/récupération montre (seul le ressenti athlète est gardé du bilan FIT), VO2max
  estimé+VDOT, zones d'allure %VMA / puissance Coggan, NP/IF/TSS vélo, charge récente 7 jours,
  type de séance détecté, liste de questions finale.
