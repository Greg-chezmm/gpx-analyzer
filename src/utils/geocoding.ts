interface NominatimResult {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    suburb?: string;
    county?: string;
    state?: string;
  };
}

export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&format=json&zoom=10&accept-language=fr`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GPX-Analyzer/1.0 (open-source sport analyzer)' },
    });
    if (!res.ok) return null;
    const data = await res.json() as NominatimResult;
    const a = data.address ?? {};
    return a.city ?? a.town ?? a.village ?? a.municipality ?? a.suburb ?? a.county ?? null;
  } catch {
    return null;
  }
}
