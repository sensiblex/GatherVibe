// Pure utility functions extracted from the event detail page.
// React / Next.js imports are intentionally absent — this file is node-safe
// so that Vitest can run tests without a browser environment.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduleEntry {
  weekday: number;
  from: string;
  to: string;
}

export interface UnifiedEvent {
  id: string;
  source: 'local' | 'kudago';
  title: string;
  description: string | null;
  body_text?: string | null;
  location: string | null;
  city: string | null;
  date_time: string | null;
  start_date?: string | null;
  start_time?: string | null;
  all_dates?: Array<{
    start: string | null;
    end: string | null;
    start_time: string | null;
    end_time: string | null;
    is_continuous: boolean;
    is_endless: boolean;
    is_startless?: boolean;
    use_place_schedule?: boolean;
  }>;
  is_permanent?: boolean;
  place_schedules?: ScheduleEntry[];
  category: string | null;
  categories?: string[];
  image_url: string | null;
  is_free?: boolean;
  price?: string;
  age_restriction?: string | null;
  place_title?: string;
  place_address?: string;
  place_phone?: string;
  place_subway?: string;
  site_url?: string;
  participants?: Array<{ role: string; name: string; image_url: string | null }>;
  lat?: number | null;
  lon?: number | null;
  location_slug?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const KUDAGO_CITY_NAMES: Record<string, string> = {
  msk: 'Москва', spb: 'Санкт-Петербург', kzn: 'Казань', nsk: 'Новосибирск',
  ekt: 'Екатеринбург', nny: 'Нижний Новгород', vbg: 'Выборг', krd: 'Краснодар',
  sochi: 'Сочи', ufa: 'Уфа', smr: 'Самара', kev: 'Киев',
};

// ---------------------------------------------------------------------------
// Existing functions (copied verbatim from page.tsx — behaviour unchanged)
// ---------------------------------------------------------------------------

/**
 * Strips HTML tags from a string and collapses whitespace.
 * NOTE: HTML entities (e.g. &nbsp;, &amp;) are NOT decoded yet —
 * TDD tests for that behaviour are intentionally failing until implemented.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatKudagoDate(event: UnifiedEvent): string {
  if (event.is_permanent) return 'Постоянная экспозиция';
  if (event.start_date) {
    const d = event.start_date;
    const t = event.start_time ? ` в ${event.start_time}` : '';
    const [y, m, day] = d.split('-').map(Number);
    const months = ['', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `${day} ${months[m] ?? ''} ${y}${t}`;
  }
  return 'Дата уточняется';
}

export function normaliseKudago(data: Record<string, unknown>): UnifiedEvent {
  const imgs = (data.images as Array<{ url: string }>) ?? [];
  const cats = (data.categories as string[]) ?? [];
  const allDates = (data.all_dates as UnifiedEvent['all_dates']) ?? [];
  const isPermanent = Boolean(data.is_permanent) ||
    allDates.some(d => d.is_endless || d.is_startless || d.use_place_schedule);
  // place_schedules: currently always returns [] — TDD test covers the case
  // where data.place_schedules is supplied and should be used.
  const placeSchedules: ScheduleEntry[] =
    (data.place_schedules as ScheduleEntry[] | undefined) ?? [];
  const locationSlug = (data.location as string) || null;
  const city = locationSlug ? (KUDAGO_CITY_NAMES[locationSlug] ?? null) : null;

  return {
    id: String(data.kudago_id ?? data.id ?? ''),
    source: 'kudago',
    title: String(data.title ?? ''),
    description: (data.description as string) || null,
    body_text: (data.body_text as string) || null,
    location: (data.place_address as string) || null,
    city,
    date_time: null,
    start_date: (data.start_date as string) ?? null,
    start_time: (data.start_time as string) ?? null,
    all_dates: allDates,
    is_permanent: isPermanent,
    place_schedules: placeSchedules,
    category: cats[0] ?? null,
    categories: cats,
    image_url: imgs[0]?.url ?? (data.cover_url as string) ?? null,
    is_free: data.is_free === true || String(data.price ?? '').trim() === '0',
    price: (data.price as string) || '',
    age_restriction: (data.age_restriction as string) ?? null,
    place_title: (data.place_title as string) || '',
    place_address: (data.place_address as string) || '',
    place_phone: (data.place_phone as string) || '',
    place_subway: (data.place_subway as string) || '',
    site_url: (data.site_url as string) || '',
    participants: (data.participants as UnifiedEvent['participants']) ?? [],
    lat: (data.lat as number) ?? null,
    lon: (data.lon as number) ?? null,
    location_slug: locationSlug,
  };
}

export function getFilteredDates(allDates: UnifiedEvent['all_dates']): NonNullable<UnifiedEvent['all_dates']> {
  if (!allDates || allDates.length === 0) return [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDate = now.getDate();
  const maxFutureDate = new Date(currentYear + 1, currentMonth, currentDate);
  const seen = new Set<string>();
  const filtered: typeof allDates = [];
  for (const d of allDates) {
    if (!d.start) continue;
    const dateYear = parseInt(d.start.split('-')[0], 10);
    if (isNaN(dateYear) || dateYear < 2020 || dateYear > currentYear + 5) continue;
    const eventDate = new Date(d.start);
    if (eventDate < now) continue;
    if (eventDate > maxFutureDate) continue;
    const key = `${d.start}-${d.start_time || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    filtered.push(d);
  }
  filtered.sort((a, b) => {
    if (!a.start || !b.start) return 0;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });
  return filtered;
}

// ---------------------------------------------------------------------------
// New functions — STUBS only (TDD: tests must fail until implemented)
// ---------------------------------------------------------------------------

/**
 * Formats an ISO date string (YYYY-MM-DD) and optional time (HH:MM) into a
 * Russian-locale short date string like "14 мая 2026" or "14 мая 2026 в 19:00".
 *
 * STUB — always returns ''. Implement to make tests pass.
 */
const MONTHS = ['', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function formatShortDate(isoDate: string, time?: string | null): string {
  const [y, m, day] = isoDate.split('-').map(Number);
  const t = time ? ` в ${time}` : '';
  return `${day} ${MONTHS[m] ?? ''} ${y}${t}`;
}

export function formatAge(age: string): string {
  const a = age.trim();
  return a.endsWith('+') ? a : `${a}+`;
}

export function safeEventTimestamp(
  startDate: string,
  startTime?: string | null,
): number | null {
  const timeStr = startTime
    ? (startTime.length === 5 ? `${startTime}:00` : startTime)
    : '00:00:00';
  const ts = new Date(`${startDate}T${timeStr}`).getTime();
  return isNaN(ts) ? null : Math.floor(ts / 1000);
}
