import { describe, it, expect } from 'vitest';
import {
  KUDAGO_CITIES,
  AGE_OPTIONS,
  TOP_TAGS,
  isValidCity,
  buildKudaGoQuery,
  toggleCategory,
  toggleTag,
  nextPriceMode,
  quickDateRange,
  WEEKDAYS,
  toggleWeekday,
} from './event-filters';

describe('KUDAGO_CITIES', () => {
  it('contains 5 supported cities with expected slugs', () => {
    const slugs = KUDAGO_CITIES.map(c => c.slug).sort();
    expect(slugs).toEqual(['ekb', 'kzn', 'msk', 'nnv', 'spb']);
  });
});

describe('isValidCity', () => {
  it('accepts supported city slugs', () => {
    expect(isValidCity('msk')).toBe(true);
    expect(isValidCity('kzn')).toBe(true);
  });
  it('rejects unknown slugs', () => {
    expect(isValidCity('nyc')).toBe(false);
    expect(isValidCity('')).toBe(false);
  });
});

describe('buildKudaGoQuery', () => {
  it('includes location, page, page_size by default', () => {
    const qs = buildKudaGoQuery({ location: 'msk' });
    const p = new URLSearchParams(qs);
    expect(p.get('location')).toBe('msk');
    expect(p.get('page')).toBe('1');
    expect(p.get('page_size')).toBe('60');
  });

  it('omits optional filters when not set', () => {
    const qs = buildKudaGoQuery({ location: 'kzn' });
    const p = new URLSearchParams(qs);
    expect(p.get('search')).toBeNull();
    expect(p.get('categories')).toBeNull();
    expect(p.get('is_free')).toBeNull();
    expect(p.get('actual_since')).toBeNull();
    expect(p.get('actual_until')).toBeNull();
  });

  it('trims search and drops empty string', () => {
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', search: '   ' })).get('search')).toBeNull();
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', search: '  рок  ' })).get('search')).toBe('рок');
  });

  it('joins multi-select categories with commas', () => {
    const qs = buildKudaGoQuery({ location: 'spb', categories: ['concert', 'theater', 'festival'] });
    expect(new URLSearchParams(qs).get('categories')).toBe('concert,theater,festival');
  });

  it('omits categories param when array is empty', () => {
    const qs = buildKudaGoQuery({ location: 'spb', categories: [] });
    expect(new URLSearchParams(qs).get('categories')).toBeNull();
  });

  it('maps priceMode=free → is_free=true, paid → is_free=false, all → omit', () => {
    const free = new URLSearchParams(buildKudaGoQuery({ location: 'msk', priceMode: 'free' }));
    expect(free.get('is_free')).toBe('true');

    const paid = new URLSearchParams(buildKudaGoQuery({ location: 'msk', priceMode: 'paid' }));
    expect(paid.get('is_free')).toBe('false');

    const all = new URLSearchParams(buildKudaGoQuery({ location: 'msk', priceMode: 'all' }));
    expect(all.get('is_free')).toBeNull();
  });

  it('emits price range filters and normalizes reversed bounds', () => {
    const range = new URLSearchParams(buildKudaGoQuery({ location: 'msk', minPrice: 500, maxPrice: 1200 }));
    expect(range.get('min_price')).toBe('500');
    expect(range.get('max_price')).toBe('1200');

    const minOnly = new URLSearchParams(buildKudaGoQuery({ location: 'msk', minPrice: 700 }));
    expect(minOnly.get('min_price')).toBe('700');
    expect(minOnly.get('max_price')).toBeNull();

    const maxOnly = new URLSearchParams(buildKudaGoQuery({ location: 'msk', maxPrice: 900 }));
    expect(maxOnly.get('min_price')).toBeNull();
    expect(maxOnly.get('max_price')).toBe('900');

    const reversed = new URLSearchParams(buildKudaGoQuery({ location: 'msk', minPrice: 1200, maxPrice: 500 }));
    expect(reversed.get('min_price')).toBe('500');
    expect(reversed.get('max_price')).toBe('1200');
  });

  it('passes actual_since and actual_until as unix seconds', () => {
    const qs = buildKudaGoQuery({
      location: 'msk',
      actualSince: 1745740800,
      actualUntil: 1745827200,
    });
    const p = new URLSearchParams(qs);
    expect(p.get('actual_since')).toBe('1745740800');
    expect(p.get('actual_until')).toBe('1745827200');
  });

  it('combines all filters for a realistic scenario', () => {
    const qs = buildKudaGoQuery({
      location: 'kzn',
      search: 'рок',
      categories: ['concert', 'festival'],
      priceMode: 'free',
      actualSince: 1745740800,
      actualUntil: 1745827200,
      page: 2,
      pageSize: 30,
    });
    const p = new URLSearchParams(qs);
    expect(p.get('location')).toBe('kzn');
    expect(p.get('search')).toBe('рок');
    expect(p.get('categories')).toBe('concert,festival');
    expect(p.get('is_free')).toBe('true');
    expect(p.get('actual_since')).toBe('1745740800');
    expect(p.get('actual_until')).toBe('1745827200');
    expect(p.get('page')).toBe('2');
    expect(p.get('page_size')).toBe('30');
  });
});

describe('toggleCategory', () => {
  it('adds a slug that is not selected', () => {
    expect(toggleCategory([], 'concert')).toEqual(['concert']);
    expect(toggleCategory(['theater'], 'concert')).toEqual(['theater', 'concert']);
  });
  it('removes a slug that is already selected', () => {
    expect(toggleCategory(['concert', 'theater'], 'concert')).toEqual(['theater']);
  });
  it('treats empty slug as «Все» — resets selection', () => {
    expect(toggleCategory(['concert'], '')).toEqual([]);
  });
});

describe('nextPriceMode', () => {
  it('cycles all → free → paid → all', () => {
    expect(nextPriceMode('all')).toBe('free');
    expect(nextPriceMode('free')).toBe('paid');
    expect(nextPriceMode('paid')).toBe('all');
  });
});

// ── Priority 2/3 helpers ────────────────────────────────────────────────────

describe('AGE_OPTIONS', () => {
  it('starts with null (любой) and includes standard MPAA-like buckets', () => {
    expect(AGE_OPTIONS[0].value).toBeNull();
    const values = AGE_OPTIONS.map(o => o.value);
    expect(values).toContain(0);
    expect(values).toContain(12);
    expect(values).toContain(18);
  });
});

describe('TOP_TAGS', () => {
  it('contains predefined set used by tag-pills UI', () => {
    expect(TOP_TAGS).toContain('free');
    expect(TOP_TAGS).toContain('детям');
    expect(TOP_TAGS.length).toBeGreaterThanOrEqual(6);
  });
});

describe('buildKudaGoQuery — extended filters', () => {
  it('omits max_age when null', () => {
    const qs = buildKudaGoQuery({ location: 'msk', maxAge: null });
    expect(new URLSearchParams(qs).get('max_age')).toBeNull();
  });
  it('includes max_age=0 (valid bucket)', () => {
    const qs = buildKudaGoQuery({ location: 'msk', maxAge: 0 });
    expect(new URLSearchParams(qs).get('max_age')).toBe('0');
  });
  it('includes max_age=18', () => {
    const qs = buildKudaGoQuery({ location: 'msk', maxAge: 18 });
    expect(new URLSearchParams(qs).get('max_age')).toBe('18');
  });

  it('joins tags with commas, omits when empty', () => {
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', tags: [] })).get('tags')).toBeNull();
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', tags: ['free', 'open air'] })).get('tags'))
      .toBe('free,open air');
  });

  it('trims placeSearch and drops empty', () => {
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', placeSearch: '   ' })).get('place_search')).toBeNull();
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', placeSearch: '  Парк Горького  ' })).get('place_search'))
      .toBe('Парк Горького');
  });

  it('emits lat/lon/radius_m together or not at all', () => {
    const qs = buildKudaGoQuery({
      location: 'msk',
      geo: { lat: 55.7536, lon: 37.6199, radiusM: 5000 },
    });
    const p = new URLSearchParams(qs);
    expect(p.get('lat')).toBe('55.7536');
    expect(p.get('lon')).toBe('37.6199');
    expect(p.get('radius_m')).toBe('5000');
  });

  it('omits geo params when geo is null or undefined', () => {
    const a = new URLSearchParams(buildKudaGoQuery({ location: 'msk' }));
    expect(a.get('lat')).toBeNull();
    const b = new URLSearchParams(buildKudaGoQuery({ location: 'msk', geo: null }));
    expect(b.get('lat')).toBeNull();
  });

  it('maps sort=popularity → order_by=popularity; date is default (omitted)', () => {
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', sort: 'popularity' })).get('order_by'))
      .toBe('popularity');
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', sort: 'date' })).get('order_by'))
      .toBeNull();
  });

  it('realistic combined scenario: free kids-friendly concerts near Moscow centre, by popularity', () => {
    const qs = buildKudaGoQuery({
      location: 'msk',
      categories: ['concert'],
      priceMode: 'free',
      maxAge: 12,
      tags: ['детям'],
      geo: { lat: 55.7536, lon: 37.6199, radiusM: 5000 },
      sort: 'popularity',
    });
    const p = new URLSearchParams(qs);
    expect(p.get('categories')).toBe('concert');
    expect(p.get('is_free')).toBe('true');
    expect(p.get('max_age')).toBe('12');
    expect(p.get('tags')).toBe('детям');
    expect(p.get('radius_m')).toBe('5000');
    expect(p.get('order_by')).toBe('popularity');
  });
});

describe('buildKudaGoQuery — social + quality filters', () => {
  it('has_party / has_free_spots only emit when true', () => {
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', hasParty: true })).get('has_party')).toBe('true');
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', hasParty: false })).get('has_party')).toBeNull();
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', hasFreeSpots: true })).get('has_free_spots')).toBe('true');
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', hasFreeSpots: false })).get('has_free_spots')).toBeNull();
  });

  it('min_attendees omitted when 0 or null', () => {
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', minAttendees: 0 })).get('min_attendees')).toBeNull();
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', minAttendees: null })).get('min_attendees')).toBeNull();
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', minAttendees: 10 })).get('min_attendees')).toBe('10');
  });

  it('time_of_day passes through verbatim', () => {
    for (const t of ['morning', 'day', 'evening', 'night'] as const) {
      expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', timeOfDay: t })).get('time_of_day')).toBe(t);
    }
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', timeOfDay: null })).get('time_of_day')).toBeNull();
  });

  it('permanence tri-state maps to only_permanent/exclude_permanent', () => {
    const only  = new URLSearchParams(buildKudaGoQuery({ location: 'msk', permanence: 'only' }));
    expect(only.get('only_permanent')).toBe('true');
    expect(only.get('exclude_permanent')).toBeNull();

    const excl  = new URLSearchParams(buildKudaGoQuery({ location: 'msk', permanence: 'exclude' }));
    expect(excl.get('exclude_permanent')).toBe('true');
    expect(excl.get('only_permanent')).toBeNull();

    const all   = new URLSearchParams(buildKudaGoQuery({ location: 'msk', permanence: 'all' }));
    expect(all.get('only_permanent')).toBeNull();
    expect(all.get('exclude_permanent')).toBeNull();
  });

  it('has_cover only emits when true', () => {
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', hasCover: true })).get('has_cover')).toBe('true');
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', hasCover: false })).get('has_cover')).toBeNull();
  });
});

describe('buildKudaGoQuery — hour range & extended sort', () => {
  it('fromHour/toHour emit both when set', () => {
    const qs = new URLSearchParams(buildKudaGoQuery({ location: 'msk', fromHour: 18, toHour: 22 }));
    expect(qs.get('from_hour')).toBe('18');
    expect(qs.get('to_hour')).toBe('22');
  });

  it('fromHour/toHour omitted when either is null/undefined', () => {
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', fromHour: 18 })).get('from_hour')).toBeNull();
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', toHour: 22 })).get('to_hour')).toBeNull();
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', fromHour: null, toHour: 22 })).get('from_hour')).toBeNull();
  });

  it('full-day range 0..24 is omitted (noop)', () => {
    const qs = new URLSearchParams(buildKudaGoQuery({ location: 'msk', fromHour: 0, toHour: 24 }));
    expect(qs.get('from_hour')).toBeNull();
    expect(qs.get('to_hour')).toBeNull();
  });

  it('overnight wrap 22..4 still emits', () => {
    const qs = new URLSearchParams(buildKudaGoQuery({ location: 'msk', fromHour: 22, toHour: 4 }));
    expect(qs.get('from_hour')).toBe('22');
    expect(qs.get('to_hour')).toBe('4');
  });

  it('extended sort values map to order_by except date', () => {
    for (const v of ['popularity', 'newest', 'ending_soon', 'most_discussed', 'alphabetical', 'nearest'] as const) {
      expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', sort: v })).get('order_by')).toBe(v);
    }
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', sort: 'date' })).get('order_by')).toBeNull();
  });
});

describe('buildKudaGoQuery — timing & schedule filters', () => {
  it('startingWithinHours omitted when null/0/undefined', () => {
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', startingWithinHours: null })).get('starting_within_hours')).toBeNull();
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', startingWithinHours: 0 })).get('starting_within_hours')).toBeNull();
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', startingWithinHours: 2 })).get('starting_within_hours')).toBe('2');
  });

  it('durationMode maps to is_short / is_long or nothing', () => {
    const s = new URLSearchParams(buildKudaGoQuery({ location: 'msk', durationMode: 'short' }));
    expect(s.get('is_short')).toBe('true');
    expect(s.get('is_long')).toBeNull();

    const l = new URLSearchParams(buildKudaGoQuery({ location: 'msk', durationMode: 'long' }));
    expect(l.get('is_long')).toBe('true');
    expect(l.get('is_short')).toBeNull();

    const n = new URLSearchParams(buildKudaGoQuery({ location: 'msk', durationMode: null }));
    expect(n.get('is_short')).toBeNull();
    expect(n.get('is_long')).toBeNull();
  });

  it('hasSchedules & onlyVerifiedPlace only emit when true', () => {
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', hasSchedules: true })).get('has_schedules')).toBe('true');
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', hasSchedules: false })).get('has_schedules')).toBeNull();
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', onlyVerifiedPlace: true })).get('only_verified_place')).toBe('true');
  });
});

describe('quickDateRange', () => {
  // Fix "now" to a known weekday: Friday 2025-03-14 15:00 local time
  const NOW = new Date(2025, 2, 14, 15, 0, 0);  // month is 0-indexed

  it('today → start-of-day and end-of-day of today', () => {
    const r = quickDateRange('today', NOW);
    expect(new Date(r.since * 1000).getHours()).toBe(0);
    expect(new Date(r.until * 1000).getHours()).toBe(23);
    expect(new Date(r.since * 1000).getDate()).toBe(14);
  });

  it('tomorrow → 2025-03-15 (Saturday)', () => {
    const r = quickDateRange('tomorrow', NOW);
    const s = new Date(r.since * 1000);
    expect(s.getDate()).toBe(15);
    expect(s.getHours()).toBe(0);
  });

  it('weekend (Fri) → Sat 15th + Sun 16th', () => {
    const r = quickDateRange('weekend', NOW);
    expect(new Date(r.since * 1000).getDate()).toBe(15);
    expect(new Date(r.since * 1000).getDay()).toBe(6);   // Sat
    expect(new Date(r.until * 1000).getDate()).toBe(16);
    expect(new Date(r.until * 1000).getDay()).toBe(0);   // Sun
  });

  it('weekend on a Saturday → same Sat + Sun', () => {
    const sat = new Date(2025, 2, 15, 10);
    const r = quickDateRange('weekend', sat);
    expect(new Date(r.since * 1000).getDate()).toBe(15);
    expect(new Date(r.until * 1000).getDate()).toBe(16);
  });

  it('week → today through +6 days', () => {
    const r = quickDateRange('week', NOW);
    expect((r.until - r.since)).toBeGreaterThan(6 * 86400 - 60);
    expect((r.until - r.since)).toBeLessThan(7 * 86400);
  });

  it('month → today through +29 days', () => {
    const r = quickDateRange('month', NOW);
    expect((r.until - r.since)).toBeGreaterThan(29 * 86400 - 60);
    expect((r.until - r.since)).toBeLessThan(30 * 86400);
  });
});

describe('WEEKDAYS + toggleWeekday', () => {
  it('has 7 weekdays, Sat+Sun marked as weekend', () => {
    expect(WEEKDAYS).toHaveLength(7);
    expect(WEEKDAYS.find(w => w.value === 5)?.isWeekend).toBe(true);
    expect(WEEKDAYS.find(w => w.value === 6)?.isWeekend).toBe(true);
    expect(WEEKDAYS.find(w => w.value === 0)?.isWeekend).toBeUndefined();
  });

  it('toggleWeekday adds missing, removes existing, keeps sorted', () => {
    expect(toggleWeekday([], 3)).toEqual([3]);
    expect(toggleWeekday([5], 6)).toEqual([5, 6]);
    expect(toggleWeekday([6], 5)).toEqual([5, 6]);          // sorted
    expect(toggleWeekday([2, 4], 3)).toEqual([2, 3, 4]);
    expect(toggleWeekday([0, 1, 5], 1)).toEqual([0, 5]);    // remove
  });
});

describe('buildKudaGoQuery — weekdays & hide_started', () => {
  it('joins weekdays CSV', () => {
    const qs = new URLSearchParams(buildKudaGoQuery({ location: 'msk', weekdays: [5, 6] }));
    expect(qs.get('weekdays')).toBe('5,6');
  });

  it('omits weekdays when empty array', () => {
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', weekdays: [] })).get('weekdays')).toBeNull();
  });

  it('hide_started only when true', () => {
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', hideStarted: true })).get('hide_started')).toBe('true');
    expect(new URLSearchParams(buildKudaGoQuery({ location: 'msk', hideStarted: false })).get('hide_started')).toBeNull();
  });
});

describe('toggleTag', () => {
  it('adds a tag that is not selected', () => {
    expect(toggleTag([], 'free')).toEqual(['free']);
  });
  it('removes a tag that is already selected', () => {
    expect(toggleTag(['free', 'детям'], 'free')).toEqual(['детям']);
  });
  it('empty string clears selection', () => {
    expect(toggleTag(['free'], '')).toEqual([]);
  });
});
