/**
 * Pure logic for building the /kudago/events query string.
 * UI components stay thin — all filter logic is testable here.
 */

export const KUDAGO_CITIES = [
  { slug: 'msk', name: 'Москва',          locative: 'Москве' },
  { slug: 'spb', name: 'Санкт-Петербург', locative: 'Санкт-Петербурге' },
  { slug: 'ekb', name: 'Екатеринбург',    locative: 'Екатеринбурге' },
  { slug: 'kzn', name: 'Казань',          locative: 'Казани' },
  { slug: 'nnv', name: 'Нижний Новгород', locative: 'Нижнем Новгороде' },
] as const;

export type CitySlug = typeof KUDAGO_CITIES[number]['slug'];

export type PriceMode = 'all' | 'free' | 'paid';
export type SortMode = 'date' | 'popularity' | 'newest' | 'ending_soon' | 'most_discussed' | 'alphabetical' | 'nearest';
export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';
export type PermanenceMode = 'all' | 'only' | 'exclude';
export type QuickDate = 'today' | 'tomorrow' | 'weekend' | 'week' | 'month';

/** Age options shown in UI. `null` = «любой возраст» (filter not applied). */
export const AGE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Любой' },
  { value: 0,    label: '0+' },
  { value: 6,    label: '6+' },
  { value: 12,   label: '12+' },
  { value: 16,   label: '16+' },
  { value: 18,   label: '18+' },
];

/** Predefined top tags shown as pills. KudaGo has thousands of tags. */
export const TOP_TAGS = [
  'free', 'open air', 'городские', 'детям',
  'концерты', 'фестивали', 'шоу', 'праздники',
] as const;

export interface GeoPoint {
  lat: number;
  lon: number;
  radiusM: number;  // radius in metres
}

export interface EventFilters {
  location: CitySlug;
  search?: string;
  categories?: string[];
  priceMode?: PriceMode;
  minPrice?: number | null;
  maxPrice?: number | null;
  actualSince?: number;      // unix seconds
  actualUntil?: number;
  maxAge?: number | null;
  tags?: string[];
  placeSearch?: string;
  geo?: GeoPoint | null;
  sort?: SortMode;
  timeOfDay?: TimeOfDay | null;
  permanence?: PermanenceMode;
  hasCover?: boolean;
  hasParty?: boolean;
  minAttendees?: number | null;
  hasFreeSpots?: boolean;
  // Timing & schedule (new)
  startingWithinHours?: number | null;
  durationMode?: 'short' | 'long' | null;
  hasSchedules?: boolean;
  onlyVerifiedPlace?: boolean;
  fromHour?: number | null;   // 0..24
  toHour?: number | null;     // 0..24
  weekdays?: number[];        // 0=Mon..6=Sun
  hideStarted?: boolean;
  page?: number;
  pageSize?: number;
}

export const WEEKDAYS: { value: number; short: string; long: string; isWeekend?: boolean }[] = [
  { value: 0, short: 'Пн', long: 'Понедельник' },
  { value: 1, short: 'Вт', long: 'Вторник' },
  { value: 2, short: 'Ср', long: 'Среда' },
  { value: 3, short: 'Чт', long: 'Четверг' },
  { value: 4, short: 'Пт', long: 'Пятница' },
  { value: 5, short: 'Сб', long: 'Суббота', isWeekend: true },
  { value: 6, short: 'Вс', long: 'Воскресенье', isWeekend: true },
];

export function toggleWeekday(cur: number[], d: number): number[] {
  return cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d].sort((a, b) => a - b);
}

export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'date',           label: 'По дате начала' },
  { value: 'popularity',     label: 'По популярности' },
  { value: 'newest',         label: 'Свежедобавленные' },
  { value: 'ending_soon',    label: 'Скоро закончится' },
  { value: 'most_discussed', label: 'Обсуждаемое' },
  { value: 'alphabetical',   label: 'По алфавиту' },
  { value: 'nearest',        label: 'Ближайшие' },   // requires geo active
];

export function isValidCity(slug: string): slug is CitySlug {
  return KUDAGO_CITIES.some(c => c.slug === slug);
}

/**
 * Build query string for GET /kudago/events.
 * Omits empty/default values so URLs stay short.
 */
export function buildKudaGoQuery(f: EventFilters): string {
  const p = new URLSearchParams();
  p.set('location', f.location);
  p.set('page', String(f.page ?? 1));
  p.set('page_size', String(f.pageSize ?? 60));

  if (f.search && f.search.trim()) p.set('search', f.search.trim());

  if (f.categories && f.categories.length > 0) {
    p.set('categories', f.categories.filter(Boolean).join(','));
  }

  if (f.priceMode === 'free') p.set('is_free', 'true');
  if (f.priceMode === 'paid') p.set('is_free', 'false');

  const minPrice = typeof f.minPrice === 'number' && Number.isFinite(f.minPrice) ? f.minPrice : null;
  const maxPrice = typeof f.maxPrice === 'number' && Number.isFinite(f.maxPrice) ? f.maxPrice : null;
  if (minPrice !== null && maxPrice !== null) {
    p.set('min_price', String(Math.min(minPrice, maxPrice)));
    p.set('max_price', String(Math.max(minPrice, maxPrice)));
  } else {
    if (minPrice !== null) p.set('min_price', String(minPrice));
    if (maxPrice !== null) p.set('max_price', String(maxPrice));
  }

  if (f.actualSince !== undefined) p.set('actual_since', String(f.actualSince));
  if (f.actualUntil !== undefined) p.set('actual_until', String(f.actualUntil));

  if (f.maxAge !== undefined && f.maxAge !== null) p.set('max_age', String(f.maxAge));

  if (f.tags && f.tags.length > 0) {
    p.set('tags', f.tags.filter(Boolean).join(','));
  }

  if (f.placeSearch && f.placeSearch.trim()) {
    p.set('place_search', f.placeSearch.trim());
  }

  if (f.geo) {
    p.set('lat', String(f.geo.lat));
    p.set('lon', String(f.geo.lon));
    p.set('radius_m', String(f.geo.radiusM));
  }

  if (f.sort && f.sort !== 'date') p.set('order_by', f.sort);

  if (f.timeOfDay) p.set('time_of_day', f.timeOfDay);

  if (f.permanence === 'only')    p.set('only_permanent', 'true');
  if (f.permanence === 'exclude') p.set('exclude_permanent', 'true');

  if (f.hasCover === true)  p.set('has_cover', 'true');
  if (f.hasParty === true)  p.set('has_party', 'true');
  if (f.hasFreeSpots === true) p.set('has_free_spots', 'true');

  if (f.minAttendees !== undefined && f.minAttendees !== null && f.minAttendees > 0) {
    p.set('min_attendees', String(f.minAttendees));
  }

  if (f.startingWithinHours !== undefined && f.startingWithinHours !== null && f.startingWithinHours > 0) {
    p.set('starting_within_hours', String(f.startingWithinHours));
  }

  if (f.durationMode === 'short') p.set('is_short', 'true');
  if (f.durationMode === 'long')  p.set('is_long',  'true');

  if (f.hasSchedules === true)    p.set('has_schedules', 'true');
  if (f.onlyVerifiedPlace === true) p.set('only_verified_place', 'true');

  if (f.weekdays && f.weekdays.length > 0) {
    p.set('weekdays', f.weekdays.join(','));
  }
  if (f.hideStarted === true) p.set('hide_started', 'true');

  // Hour-range is emitted only when it's a real subrange (not full day 0..24).
  if (
    f.fromHour !== undefined && f.fromHour !== null &&
    f.toHour !== undefined && f.toHour !== null &&
    !(f.fromHour === 0 && f.toHour === 24)
  ) {
    p.set('from_hour', String(f.fromHour));
    p.set('to_hour',   String(f.toHour));
  }

  return p.toString();
}

// ── Quick-date preset → {since, until} in unix seconds ──────────────────────

export function quickDateRange(preset: QuickDate, now: Date = new Date()): { since: number; until: number } {
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOfDay   = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  const addDays    = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const s = (d: Date) => Math.floor(d.getTime() / 1000);

  const today = startOfDay(now);
  switch (preset) {
    case 'today':    return { since: s(today), until: s(endOfDay(today)) };
    case 'tomorrow': { const t = addDays(today, 1); return { since: s(t), until: s(endOfDay(t)) }; }
    case 'weekend': {
      // Nearest upcoming Saturday-Sunday (or current if it's already weekend).
      const dow = today.getDay();                   // 0=Sun, 6=Sat
      const daysToSat = dow === 6 ? 0 : (6 - dow) % 7;
      const sat = addDays(today, daysToSat);
      const sun = addDays(sat, 1);
      return { since: s(sat), until: s(endOfDay(sun)) };
    }
    case 'week':     return { since: s(today), until: s(endOfDay(addDays(today, 6))) };
    case 'month':    return { since: s(today), until: s(endOfDay(addDays(today, 29))) };
  }
}

/** Toggle a tag in/out of the current selection (same semantics as toggleCategory). */
export function toggleTag(selected: string[], tag: string): string[] {
  if (!tag) return [];
  return selected.includes(tag)
    ? selected.filter(t => t !== tag)
    : [...selected, tag];
}

/** Add/remove a category slug from the current selection. */
export function toggleCategory(selected: string[], slug: string): string[] {
  if (!slug) return [];   // empty slug = «Все»
  return selected.includes(slug)
    ? selected.filter(s => s !== slug)
    : [...selected, slug];
}

/** Cycle through 3-state price filter: all → free → paid → all. */
export function nextPriceMode(cur: PriceMode): PriceMode {
  return cur === 'all' ? 'free' : cur === 'free' ? 'paid' : 'all';
}
