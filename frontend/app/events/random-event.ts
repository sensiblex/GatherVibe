import type { KudaGoEvent } from '../components/EventCard';

export function pickRandomEvent(
  events: KudaGoEvent[],
  random: () => number = Math.random,
): KudaGoEvent | null {
  if (events.length === 0) return null;

  const index = Math.min(Math.floor(random() * events.length), events.length - 1);
  return events[index];
}

export function eventDetailHref(event: KudaGoEvent): string {
  return `/events/${event.kudago_id}`;
}
