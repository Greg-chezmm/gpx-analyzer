# gpx-analyzer

Application web (React + TypeScript + Vite) d'analyse d'activités course/vélo à partir de fichiers GPX, FIT et JSON Suunto. L'interface est en français.

Le traitement des fichiers se fait dans le navigateur. Firebase (Auth + Firestore) stocke les activités et réglages, Google Drive conserve les fichiers sources.

## Démarrage

```bash
npm install
cp .env.local.example .env.local   # puis renseigner les clés VITE_*
npm run dev                        # http://localhost:5173
```

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de dev Vite |
| `npm run build` | Vérification TypeScript + build de production dans `dist/` |
| `npm run lint` | ESLint |
| `npm test` | Tests unitaires (Vitest) |
| `npm run preview` | Prévisualise le build |

## Déploiement

Chaque push sur `main` déclenche `.github/workflows/deploy.yml` (lint, tests, build, GitHub Pages). Les clés `VITE_*` viennent des secrets du dépôt. L'application est servie sous `/gpx-analyzer/`.

Voir `CLAUDE.md` pour l'architecture et `NOTES.md` pour les décisions de conception.
