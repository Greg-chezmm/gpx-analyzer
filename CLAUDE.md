# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server (HMR) at http://localhost:5173
npm run build      # TypeScript check + production build to dist/
npm run lint       # Run ESLint
npm test           # Run Vitest unit tests (src/utils/*.test.ts)
npm run preview    # Preview production build locally
```

## Architecture

**gpx-analyzer** is a React + TypeScript SPA for analyzing GPX/FIT/Suunto JSON files from running/cycling activities. Parsing and analysis happen in the browser; there is no custom backend. Firebase (Auth + Firestore) stores activities, settings and manual segments; Google Drive keeps the source files.

### Data flow

```
Upload GPX file
    → gpxParser.ts: parseGPX() — XML parsing, track point extraction, metric calculation
    → gpxParser.ts: calculateSplits() — 1km segment analysis
    → App.tsx state (activity, splits, hoveredPointIndex)
    → Dashboard components (map, charts, splits table, metric cards)
```

### Key files

| File | Responsibility |
|------|---------------|
| `src/utils/gpxParser.ts` | All domain logic: XML parsing, Haversine distance, elevation gain/loss, speed smoothing (5-pt moving average), activity type detection, split calculation. Core types: `GPXActivity`, `GPXTrackPoint`, `GPXSplit`. |
| `src/utils/sampleGPX.ts` | Generates a realistic Paris running route with HR/cadence for dev testing. |
| `src/App.tsx` | Root component; owns all state; composes the dashboard. |
| `src/components/ActivityMap.tsx` | Leaflet map with polyline and synchronized hover marker. |
| `src/components/ChartViewer.tsx` | Hand-rolled SVG charts (elevation, speed, HR, cadence). Downsamples to ≤300 points; uses binary search for hover hit-testing. |
| `src/components/SplitsTable.tsx` | Kilometer-by-kilometer table with TSV clipboard export. |
| `src/utils/fitParser.ts`, `suuntoParser.ts`, `fitMerger.ts` | FIT parsing, Suunto JSON laps import, merge of FIT/GPX data. |
| `src/utils/segments.ts` | Geohash fingerprints and geometric route/segment matching ("Ton parcours habituel", manual segments). |
| `src/utils/trainingMetrics.ts` | TRIMP, CTL/ATL/TSB, efficiency trend. |
| `src/utils/workoutStructure.ts`, `intervals.ts`, `hillRepeats.ts`, `climbs.ts` | Workout structure, interval, hill-repeat and climb detection. |
| `src/utils/firebase.ts`, `firestoreStorage.ts`, `driveStorage.ts` | Firebase init, Firestore persistence, Drive file storage. |
| `src/hooks/useFirebaseAuth.ts`, `useFirebaseCloud.ts`, `useGoogleDrive.ts` | Auth, cloud activity list, Drive OAuth (popup on desktop, redirect on mobile). |
| `src/hooks/useStoredSegments.ts`, `useStoredSegmentScan.ts`, `useFullRouteMatches.ts` | Manual segments CRUD/scan and automatic full-route matching. |

### Cross-component interaction

`hoveredPointIndex` in App state synchronizes all views: hovering on the map, any chart, or a splits row highlights the corresponding point everywhere simultaneously.

### Configuration notes

- **Vite base path:** `/gpx-analyzer/` — required for subdirectory deployment.
- **Env vars:** `VITE_FIREBASE_*`, `VITE_GOOGLE_CLIENT_ID`, `VITE_TRACESTRACK_KEY` (see `.env.local.example`); injected from GitHub secrets in CI.
- **Leaflet icons:** Loaded from CDN (in `index.html`) to avoid Vite module resolution issues with Leaflet's default icon assets.
- **Google Fonts:** Inter (body) and Outfit (headings) loaded from CDN.
- The UI language is **French**.
