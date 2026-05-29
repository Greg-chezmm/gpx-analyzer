// Helper to generate a realistic running route around Paris for instant testing
export function generateSampleGPX(): string {
  const startLat = 48.858844; // Eiffel Tower
  const startLon = 2.294350;
  const numPoints = 150;
  const durationSec = 3600; // 1 hour run
  const startTime = new Date();
  startTime.setMinutes(startTime.getMinutes() - 60);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPX Analyzer Premium Generator" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata>
    <name>Course à pied matinale dans Paris</name>
    <time>${startTime.toISOString()}</time>
  </metadata>
  <trk>
    <name>Tour Eiffel - Berges de Seine - Trocadéro</name>
    <type>running</type>
    <trkseg>
`;

  let currentLat = startLat;
  let currentLon = startLon;
  let currentEle = 35.0; // base height in Paris (meters)
  
  // Generating a beautiful loop track: Tower -> river banks -> Trocadero -> back
  for (let i = 0; i < numPoints; i++) {
    const progress = i / (numPoints - 1);
    
    // Angle for looping coordinate calculations
    const angle = progress * Math.PI * 2;
    
    // Programmatic path coordinates
    currentLat = startLat + 0.005 * Math.sin(angle) + 0.002 * Math.cos(angle * 2);
    currentLon = startLon + 0.012 * Math.sin(angle * 2) - 0.004 * Math.cos(angle);
    
    // Realistic rolling hills (Elevation)
    // Eiffel tower base is ~35m, we climb up to Trocadero heights ~65m
    currentEle = 35.0 + Math.sin(angle) * 15.0 + Math.cos(angle * 3) * 3.0;
    
    // Timestamp
    const ptTime = new Date(startTime.getTime() + (progress * durationSec * 1000));
    
    // Heart rate logic: starts at 120, drifts up, peaks on elevation hills
    const hrNoise = Math.sin(angle * 10) * 4;
    const hrElevFactor = Math.max(0, currentEle - 35.0) * 1.2;
    const hr = Math.round(125 + progress * 15 + hrElevFactor + hrNoise);

    // Cadence: running cadence around 165-175 steps per minute
    const cadNoise = Math.floor(Math.sin(angle * 30) * 3);
    const cad = 170 + cadNoise;

    // Power: simulated running power (W) — typically 200-350W for running
    const powerBase = 240;
    const powerElevFactor = Math.max(0, currentEle - 35.0) * 2.5;
    const powerNoise = Math.sin(angle * 8) * 15;
    const power = Math.round(powerBase + powerElevFactor + powerNoise);

    xml += `      <trkpt lat="${currentLat.toFixed(6)}" lon="${currentLon.toFixed(6)}">
        <ele>${currentEle.toFixed(1)}</ele>
        <time>${ptTime.toISOString()}</time>
        <extensions>
          <gpxtpx:TrackPointExtension>
            <gpxtpx:hr>${hr}</gpxtpx:hr>
            <gpxtpx:cad>${cad}</gpxtpx:cad>
          </gpxtpx:TrackPointExtension>
          <power>${power}</power>
        </extensions>
      </trkpt>\n`;
  }

  xml += `    </trkseg>
  </trk>
</gpx>`;

  return xml;
}
