import type { CitySlug } from './event-filters';

export interface MappableEvent {
  kudago_id: number;
  lat: number | null;
  lon: number | null;
}

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

function isValidCoord(lat: unknown, lon: unknown): lat is number {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lon < -180 || lon > 180) return false;
  if (lat === 0 && lon === 0) return false;
  return true;
}

export function filterEventsWithCoords<T extends MappableEvent>(events: T[]): T[] {
  return events.filter(e => isValidCoord(e.lat, e.lon));
}

export function computeBounds(events: MappableEvent[]): MapBounds | null {
  const valid = filterEventsWithCoords(events);
  if (valid.length === 0) return null;

  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;
  for (const e of valid) {
    const lat = e.lat as number;
    const lon = e.lon as number;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return { minLat, maxLat, minLon, maxLon };
}

const CITY_CENTERS: Record<CitySlug, LatLon> = {
  msk: { lat: 55.7558, lon: 37.6173 },
  spb: { lat: 59.9343, lon: 30.3351 },
  ekb: { lat: 56.8389, lon: 60.6057 },
  kzn: { lat: 55.7963, lon: 49.1088 },
  nnv: { lat: 56.3269, lon: 44.0075 },
};

export function cityCenter(slug: CitySlug): LatLon {
  return CITY_CENTERS[slug];
}

export function formatMapStats(mapped: number, total: number): string {
  if (total === 0 && mapped === 0) return 'Нет событий на карте';
  if (mapped === total) return `${mapped} событий на карте`;
  return `${mapped} из ${total} на карте`;
}
