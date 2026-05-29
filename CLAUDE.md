# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server (HMR) at http://localhost:5173
npm run build      # TypeScript check + production build to dist/
npm run lint       # Run ESLint
npm run preview    # Preview production build locally
```

No test runner is configured.

## Architecture

**gpx-analyzer** is a 100% client-side React + TypeScript SPA for analyzing GPX files from running/cycling activities. All processing happens in the browser — no backend.

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

### Cross-component interaction

`hoveredPointIndex` in App state synchronizes all views: hovering on the map, any chart, or a splits row highlights the corresponding point everywhere simultaneously.

### Configuration notes

- **Vite base path:** `/gpx-analyzer/` — required for subdirectory deployment.
- **Leaflet icons:** Loaded from CDN (in `index.html`) to avoid Vite module resolution issues with Leaflet's default icon assets.
- **Google Fonts:** Inter (body) and Outfit (headings) loaded from CDN.
- The UI language is **French**.
