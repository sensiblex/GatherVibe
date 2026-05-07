import { KudaGoEvent } from '../components/EventCard';

export function mergeEventPages(existing: KudaGoEvent[], incoming: KudaGoEvent[]): KudaGoEvent[] {
  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;

  const seen = new Set(existing.map((event) => String(event.kudago_id)));
  const merged = [...existing];
  for (const event of incoming) {
    const id = String(event.kudago_id);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(event);
  }
  return merged;
}

export function hasMoreEvents(loadedCount: number, totalCount: number | null): boolean {
  if (totalCount === null) return false;
  return loadedCount < totalCount;
}

