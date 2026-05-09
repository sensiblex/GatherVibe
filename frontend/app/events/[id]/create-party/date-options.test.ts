import { describe, expect, it } from 'vitest';
import { buildPermanentDateOptions } from './date-options';

describe('buildPermanentDateOptions', () => {
  it('returns upcoming slots for matching weekdays', () => {
    const now = new Date('2026-05-11T10:00:00'); // Monday
    const options = buildPermanentDateOptions(
      [
        { weekday: 1, from: '19:00', to: '21:00' },
        { weekday: 3, from: '18:30', to: '20:00' },
      ],
      now,
      7,
    );

    expect(options.length).toBeGreaterThan(1);
    expect(options[0].value).toBe(Math.floor(new Date('2026-05-11T19:00:00').getTime() / 1000));
    expect(options[1].value).toBe(Math.floor(new Date('2026-05-13T18:30:00').getTime() / 1000));
  });

  it('skips past time slots for the current day', () => {
    const now = new Date('2026-05-11T20:00:00'); // Monday
    const options = buildPermanentDateOptions(
      [{ weekday: 1, from: '19:00', to: '21:00' }],
      now,
      7,
    );

    expect(options.length).toBe(1);
    expect(options[0].value).toBe(Math.floor(new Date('2026-05-18T19:00:00').getTime() / 1000));
  });
});
