import { describe, expect, it } from 'vitest';
import type { KudaGoEvent } from '../components/EventCard';
import { eventDetailHref, pickRandomEvent } from './random-event';

function event(id: number): KudaGoEvent {
  return {
    kudago_id: id,
    title: `Event ${id}`,
    short_title: '',
    description: '',
    categories: [],
    tags: [],
    price: '',
    is_free: false,
    age_restriction: null,
    is_permanent: false,
    start_date: null,
    start_time: null,
    place_title: '',
    place_address: '',
    lat: null,
    lon: null,
    cover_url: null,
    site_url: '',
  };
}

describe('pickRandomEvent', () => {
  it('returns null when the event list is empty', () => {
    expect(pickRandomEvent([])).toBeNull();
  });

  it('selects an event using the supplied random source', () => {
    const events = [event(101), event(202), event(303)];

    expect(pickRandomEvent(events, () => 0.7)?.kudago_id).toBe(303);
  });

  it('keeps the last index inside bounds when random returns 1', () => {
    const events = [event(101), event(202), event(303)];

    expect(pickRandomEvent(events, () => 1)?.kudago_id).toBe(303);
  });
});

describe('eventDetailHref', () => {
  it('matches the existing event detail route format', () => {
    expect(eventDetailHref(event(202))).toBe('/events/202');
  });
});
