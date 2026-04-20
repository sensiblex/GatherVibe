import { describe, it, expect } from 'vitest';
import {
  filterEventsWithCoords,
  computeBounds,
  cityCenter,
  formatMapStats,
  type MappableEvent,
} from './events-map';

function ev(id: number, lat: number | null, lon: number | null): MappableEvent {
  return { kudago_id: id, lat, lon };
}

describe('filterEventsWithCoords', () => {
  it('keeps only events with both lat and lon', () => {
    const events = [
      ev(1, 55.75, 37.62),
      ev(2, null, null),
      ev(3, 55.76, null),
      ev(4, null, 37.63),
      ev(5, 55.77, 37.64),
    ];
    const out = filterEventsWithCoords(events);
    expect(out.map(e => e.kudago_id)).toEqual([1, 5]);
  });

  it('returns empty array when no events have coords', () => {
    expect(filterEventsWithCoords([ev(1, null, null)])).toEqual([]);
  });

  it('rejects NaN coordinates', () => {
    expect(filterEventsWithCoords([ev(1, NaN, 37.6)])).toEqual([]);
    expect(filterEventsWithCoords([ev(1, 55.7, NaN)])).toEqual([]);
  });

  it('rejects out-of-range coordinates', () => {
    // Latitude valid: [-90, 90]; longitude valid: [-180, 180]
    expect(filterEventsWithCoords([ev(1, 95, 37.6)])).toEqual([]);
    expect(filterEventsWithCoords([ev(1, 55.7, 200)])).toEqual([]);
    expect(filterEventsWithCoords([ev(1, -90.1, 37.6)])).toEqual([]);
  });

  it('rejects exactly (0, 0) as a likely "null-island" sentinel', () => {
    expect(filterEventsWithCoords([ev(1, 0, 0)])).toEqual([]);
  });
});

describe('computeBounds', () => {
  it('returns null for empty input', () => {
    expect(computeBounds([])).toBeNull();
  });

  it('returns a zero-area box for a single point', () => {
    const b = computeBounds([ev(1, 55.75, 37.62)]);
    expect(b).toEqual({ minLat: 55.75, maxLat: 55.75, minLon: 37.62, maxLon: 37.62 });
  });

  it('returns the tight box covering all points', () => {
    const b = computeBounds([
      ev(1, 55.75, 37.62),
      ev(2, 55.80, 37.50),
      ev(3, 55.70, 37.70),
    ]);
    expect(b).toEqual({ minLat: 55.70, maxLat: 55.80, minLon: 37.50, maxLon: 37.70 });
  });

  it('ignores events without coords', () => {
    const b = computeBounds([
      ev(1, 55.75, 37.62),
      ev(2, null, null),
      ev(3, 55.80, 37.70),
    ]);
    expect(b).toEqual({ minLat: 55.75, maxLat: 55.80, minLon: 37.62, maxLon: 37.70 });
  });
});

describe('cityCenter', () => {
  it('returns Moscow coords for msk', () => {
    const c = cityCenter('msk');
    expect(c.lat).toBeCloseTo(55.75, 1);
    expect(c.lon).toBeCloseTo(37.62, 1);
  });

  it('returns Kazan coords for kzn', () => {
    const c = cityCenter('kzn');
    expect(c.lat).toBeCloseTo(55.79, 1);
    expect(c.lon).toBeCloseTo(49.12, 1);
  });

  it('returns coords for every supported city slug', () => {
    const slugs = ['msk', 'spb', 'ekb', 'kzn', 'nnv'] as const;
    for (const s of slugs) {
      const c = cityCenter(s);
      expect(Number.isFinite(c.lat)).toBe(true);
      expect(Number.isFinite(c.lon)).toBe(true);
    }
  });
});

describe('formatMapStats', () => {
  it('formats correctly when some events are mapped', () => {
    expect(formatMapStats(42, 100)).toBe('42 из 100 на карте');
  });

  it('omits the "of N" when all events are mapped', () => {
    expect(formatMapStats(10, 10)).toBe('10 событий на карте');
  });

  it('handles zero total', () => {
    expect(formatMapStats(0, 0)).toBe('Нет событий на карте');
  });

  it('handles zero mapped but non-zero total', () => {
    expect(formatMapStats(0, 50)).toBe('0 из 50 на карте');
  });
});
