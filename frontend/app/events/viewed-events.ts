export const VIEWED_EVENTS_STORAGE_KEY = 'gathervibe:viewedEvents';

function normalizeEventId(id: string | number): string {
  return String(id).trim();
}

function uniqueEventIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];

  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== 'string' && typeof id !== 'number') continue;
    const normalized = normalizeEventId(id);
    if (normalized) seen.add(normalized);
  }
  return Array.from(seen);
}

export function readViewedEventIds(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(VIEWED_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    return uniqueEventIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function markEventViewed(id: string | number): string[] {
  const normalized = normalizeEventId(id);
  if (!normalized) return readViewedEventIds();

  const ids = readViewedEventIds();
  if (!ids.includes(normalized)) ids.push(normalized);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(VIEWED_EVENTS_STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // localStorage can be unavailable or full; the UI should keep working.
    }
  }

  return ids;
}
