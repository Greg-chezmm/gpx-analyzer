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
Comparaison à sens unique (référence fixe → candidates), via `findLongestMatch`.

Seuls les segments dont le tracé est effectivement suivi par l'activité
**actuellement ouverte** sont affichés (`matchStoredSegment` appliqué à
`activity.points` en local, sans téléchargement) — un segment défini sur un
autre parcours (même type d'activité) n'apparaît pas, même s'il a un
classement en cache par ailleurs. Un panneau de diagnostic repliable liste
les segments écartés avec la raison précise (géométrie insuffisante / aucun
corridor / couverture cumulée insuffisante, avec distances brutes). Bouton
carte (icône 🗺️) sur chaque segment (retenu ou écarté) pour visualiser son
tracé de référence.

**`findLongestMatch` regroupe désormais les corridors valides par proximité**
(2026-08-26) — une montée en lacets serrés peut faire diverger le suivi
d'index même en comparant un segment à sa propre activité source (le tracé
se recroise près de lui-même, cassant la continuité du run détecté), sans
que ce soit un vrai détour. Découvert via le panneau de diagnostic : un
segment de 617m ne trouvait que 367m de couverture (60% requis = 370m)
contre sa propre activité d'origine.
- Premier correctif (additionner TOUS les runs, sans condition de proximité,
  comme `computeTotalCoverage`) a réglé ce cas mais causé une régression :
  un segment de 544m se voyait proposer des "passages" de 1 à 6 km, en
  recollant des coïncidences géométriques éparpillées sur toute une
  activité plus longue.
- Fix définitif : `bestSegmentCluster()` regroupe les runs valides par
  proximité le long du tracé candidat (écart max 150m entre deux runs pour
  compter comme le même passage, `MAX_SEGMENT_CLUSTER_GAP_M`), additionne
  la couverture au sein de chaque groupe, et ne retient que le groupe le
  mieux couvert — recolle bien les fragments d'un même passage en lacets
  (proches), rejette les coïncidences éparpillées (loin les unes des
  autres). Factorisé et réutilisé par `debugStoredSegmentMatch` pour que le
  diagnostic reflète exactement ce que le matching calcule.
- ⚠️ Le classement en cache d'un segment n'est PAS recalculé automatiquement
  après ce changement — cliquer "Actualiser" pour reflétér le nouveau calcul.
- Ce fix seul n'a **pas suffi** sur les vraies données de Greg (mêmes distances
  aberrantes après refresh forcé + Actualiser). Cause racine plus profonde :
  dans `computeRuns`, le critère de continuité (`b >= cur.bLast - 2`)
  empêchait les reculs mais ne bornait jamais les **sauts en avant** — un
  candidat qui repasse près du même point géographique loin dans son propre
  parcours (carrefour/quartier recroisé) pouvait faire "sauter" le run sans
  le couper, gonflant la distance rapportée. Fix : `MAX_FORWARD_JUMP_POINTS = 5`
  (un point de A doit avancer d'environ 1 cran de B, un saut plus grand coupe
  le run) — vérifié sans régression sur le cas des lacets.
- Même après ce fix, le self-match de Greg restait bloqué à ~76% (413m/544m) au lieu de ~100% —
  diagnostic visuel ajouté (`debugSegmentPointRuns`, carte colorée par corridor dans
  `SegmentMatchDebugMapModal`) : 100% des points étaient appariés individuellement, mais répartis
  sur **2 corridors distincts séparés de 1199m** le long du tracé candidat. Cause racine trouvée en
  relisant `computeMatchIndices` : la pénalité de progression (`PROGRESS_PENALTY_M_PER_POINT`) ne
  fait que départager entre candidats déjà valides (corridor+cap), elle ne borne jamais l'écart
  d'index absolu. Au sommet du lacet, le point de continuité correct était rejeté par le filtre
  cap/corridor (inversion brutale de direction), laissant comme seul candidat valide un point
  géographiquement proche mais très loin dans le tracé candidat (la partie descente d'un
  aller-retour qui repasse près du même endroit) — ce point lointain était donc accepté à défaut
  d'alternative. Fix : `MAX_PROGRESS_GAP_POINTS = 10` rejette purement et simplement tout candidat
  trop loin de la progression attendue, même s'il passe corridor+cap — les quelques points ainsi
  laissés sans correspondance sont tolérés par `MAX_GAP_POINTS` (4) sans casser le run. Résultat :
  self-match Greg passé de 413m à 524m/544m (96%), un seul corridor.
- Une fois ce bug de fragmentation résolu, un vrai passage complet couvre ~95%+ (au lieu de plafonner
  vers 60-76% à cause de la fragmentation) — seuil de rétention relevé de 60% à 90% de la longueur du
  segment (`minSegmentMatchDistance`) pour exclure les montées interrompues avant la fin (cas réel :
  un arrêt aux 3/4 d'un lacet ne doit pas compter comme un passage réussi).
- Fix apparenté trouvé juste après (activité valide mais 0/25 points appariés, 0 corridor) : le
  plafond dur `MAX_PROGRESS_GAP_POINTS` peut bloquer TOUS les points d'une activité si le tout premier
  point (i=0, sans continuité établie) s'accroche par erreur à une ambiguïté géométrique locale — plus
  aucun point suivant ne peut alors passer le plafond, quel que soit le bon appariement disponible.
  Fix : `MAX_PROGRESS_MISS_STREAK` — après plusieurs échecs consécutifs, l'ancre de progression
  (`expectedB`) est abandonnée pour permettre une recherche libre au point suivant, plutôt que de
  rester bloquée indéfiniment sur une ancre fausse.

### Détection des passages répétés dans une même séance (2026-08-26)

Greg fait parfois des fractionnés en côte (plusieurs montées du même segment dans la même sortie,
ex. 6 montées d'"Estevelles Montée 1" le 08/08). `matchStoredSegment`/`findLongestMatch` ne
retournaient qu'un seul passage par activité (le mieux couvert) — nouvelle fonction
`matchStoredSegmentAll`, utilisée par `useStoredSegmentScan.ts` et `App.tsx` (`mergeIntoStoredSegments`)
à la place de `matchStoredSegment`.

Une simple lecture de tous les clusters de `groupSegmentRuns` en un seul appel ne suffit pas : une
côte gravie plusieurs fois a une géométrie quasi identique à chaque répétition, donc pendant le suivi
de continuité (`computeMatchIndices`), après le trou causé par la descente entre deux montées, la
recherche peut se "raccrocher" par erreur sur la 1ère montée déjà appariée plutôt que d'avancer vers
la suivante (mêmes coordonnées géographiques, seule leur position dans le temps du candidat diffère)
— un seul passage était détecté au lieu de 6, les runs des montées 2 à 6 n'existant simplement pas
dans le résultat de `computeRuns`.

Fix : masquage itératif. Après chaque passage trouvé, ses coordonnées sont neutralisées (déplacées
hors de portée du corridor, dans une copie de travail du tracé candidat — les index restent intacts)
puis la recherche est relancée depuis zéro ; la répétition déjà détectée n'étant plus un candidat
possible, la suivante devient sans ambiguïté la meilleure correspondance. Répété jusqu'à épuisement ou
`MAX_SEGMENT_PASSES` (12). N'a nécessité aucune modification de `computeMatchIndices`/`computeRuns`
(logique de continuité partagée avec le reste du moteur, déjà validée par ailleurs) — le masquage
opère uniquement dans `matchStoredSegmentAll`, risque de régression minimal.

Le top 10 du classement en cache reste inchangé (trié par temps, toutes activités confondues) — une
même activité peut donc apparaître plusieurs fois si plusieurs de ses passages figurent parmi les
meilleurs temps historiques (décision explicite de Greg : "on garde le top 10 des segments c'est tout").

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
- Distance minimale d'un segment manuel : 90% de sa propre longueur, min 100 m
  (relevé de 60% le 2026-08-26 une fois le bug de fragmentation d'index corrigé)
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
