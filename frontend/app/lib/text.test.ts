import { describe, expect, it } from 'vitest';
import { capitalizeFirstDisplayChar } from './text';

describe('capitalizeFirstDisplayChar', () => {
  it('capitalizes only the first displayed character', () => {
    expect(capitalizeFirstDisplayChar('вечеринка на крыше')).toBe('Вечеринка на крыше');
    expect(capitalizeFirstDisplayChar('концерт')).toBe('Концерт');
    expect(capitalizeFirstDisplayChar('open air')).toBe('Open air');
  });

  it('does not lowercase the rest of the title', () => {
    expect(capitalizeFirstDisplayChar('DJ set')).toBe('DJ set');
    expect(capitalizeFirstDisplayChar('open NASA day')).toBe('Open NASA day');
  });

  it('handles empty and absent values safely', () => {
    expect(capitalizeFirstDisplayChar('')).toBe('');
    expect(capitalizeFirstDisplayChar('   ')).toBe('');
    expect(capitalizeFirstDisplayChar(null)).toBe('');
    expect(capitalizeFirstDisplayChar(undefined)).toBe('');
  });

  it('removes leading whitespace so the displayed title starts with text', () => {
    expect(capitalizeFirstDisplayChar('   open air')).toBe('Open air');
  });
});
