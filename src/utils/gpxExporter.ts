import type { GPXActivity, GPXTrackPoint } from './gpxCore';
import type { GPXInterval } from './intervals';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function trkpt(p: GPXTrackPoint, ind: string): string {
  const lines: string[] = [];
  lines.push(`${ind}<trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">`);
  if (p.ele !== null) lines.push(`${ind}  <ele>${p.ele.toFixed(2)}</ele>`);
  if (p.time)         lines.push(`${ind}  <time>${p.time.toISOString()}</time>`);

  const hasExt = p.hr !== null || p.cad !== null || p.power !== null || p.temp !== null;
  if (hasExt) {
    lines.push(`${ind}  <extensions><gpxtpx:TrackPointExtension>`);
    if (p.temp  !== null) lines.push(`${ind}    <gpxtpx:atemp>${p.temp.toFixed(1)}</gpxtpx:atemp>`);
    if (p.hr    !== null) lines.push(`${ind}    <gpxtpx:hr>${p.hr}</gpxtpx:hr>`);
    if (p.cad   !== null) lines.push(`${ind}    <gpxtpx:cad>${p.cad}</gpxtpx:cad>`);
    if (p.power !== null) lines.push(`${ind}    <gpxtpx:power>${p.power}</gpxtpx:power>`);
    lines.push(`${ind}  </gpxtpx:TrackPointExtension></extensions>`);
  }
  lines.push(`${ind}</trkpt>`);
  return lines.join('\n');
}

function trkseg(pts: GPXTrackPoint[], label: string): string {
  if (pts.length < 2) return '';
  const lines = [`    <trkseg>`];
  if (label) lines.push(`      <!-- ${label} -->`);
  for (const p of pts) lines.push(trkpt(p, '      '));
  lines.push(`    </trkseg>`);
  return lines.join('\n');
}

interface Seg { pts: GPXTrackPoint[]; label: string }

function buildSegments(points: GPXTrackPoint[], intervals: GPXInterval[] | null): Seg[] {
  if (!intervals || intervals.length === 0) {
    return [{ pts: points, label: '' }];
  }

  const sorted = [...intervals].sort((a, b) => a.startPointIndex - b.startPointIndex);
  const segs: Seg[] = [];
  let cursor = 0;

  for (const iv of sorted) {
    const start = Math.max(0, iv.startPointIndex);
    const end   = Math.min(points.length - 1, iv.endPointIndex);

    // Échauffement ou gap entre intervalles
    if (start > cursor) {
      const pre = points.slice(cursor, start + 1);
      if (pre.length >= 2) {
        segs.push({ pts: pre, label: cursor === 0 ? 'Échauffement' : 'Transition' });
      }
    }

    const segPts = points.slice(start, end + 1);
    if (segPts.length >= 2) {
      const label = iv.type === 'effort'
        ? `Effort ${iv.number}`
        : `Récupération ${iv.number}`;
      segs.push({ pts: segPts, label });
    }

    cursor = end;
  }

  // Retour au calme
  if (cursor < points.length - 1) {
    const post = points.slice(cursor);
    if (post.length >= 2) segs.push({ pts: post, label: 'Retour au calme' });
  }

  return segs;
}

export function exportToGPX(activity: GPXActivity, intervals: GPXInterval[] | null): string {
  const { points, name, startTime, activityType } = activity;
  const safeName = escapeXml(name || 'Activité');
  const timeStr  = startTime ? startTime.toISOString() : '';
  const typeStr  = activityType === 'cycling' ? 'cycling' : 'running';

  const segs = buildSegments(points, intervals);

  const header = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="GPX Analyzer"',
    '  xmlns="http://www.topografix.com/GPX/1/1"',
    '  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"',
    '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    '  <metadata>',
    `    <name>${safeName}</name>`,
    timeStr ? `    <time>${timeStr}</time>` : '',
    '  </metadata>',
    '  <trk>',
    `    <name>${safeName}</name>`,
    `    <type>${typeStr}</type>`,
  ].filter(Boolean);

  const body = segs.map(s => trkseg(s.pts, s.label)).filter(Boolean);
  const footer = ['  </trk>', '</gpx>'];

  return [...header, ...body, ...footer].join('\n');
}

export function downloadGPX(activity: GPXActivity, intervals: GPXInterval[] | null): void {
  const xml  = exportToGPX(activity, intervals);
  const blob = new Blob([xml], { type: 'application/gpx+xml;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${(activity.name || 'activite').replace(/[^a-zA-Z0-9_\-.]/g, '_')}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
