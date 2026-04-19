import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array } from './push';

describe('urlBase64ToUint8Array', () => {
  it('decodes a known VAPID-style base64url key', () => {
    const key = 'BPl2qP4';
    const out = urlBase64ToUint8Array(key);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBeGreaterThan(0);
  });

  it('replaces URL-safe chars (- and _)', () => {
    const withDashes = urlBase64ToUint8Array('AAAA-_AAAAAA');
    const withPadding = urlBase64ToUint8Array('AAAA+/AAAAAA');
    expect(Array.from(withDashes)).toEqual(Array.from(withPadding));
  });

  it('handles missing padding', () => {
    expect(() => urlBase64ToUint8Array('AAAA')).not.toThrow();
    expect(() => urlBase64ToUint8Array('AAA')).not.toThrow();
    expect(() => urlBase64ToUint8Array('AA')).not.toThrow();
  });

  it('produces deterministic output', () => {
    const a = urlBase64ToUint8Array('Hello-World_');
    const b = urlBase64ToUint8Array('Hello-World_');
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('returns empty array for empty string', () => {
    const out = urlBase64ToUint8Array('');
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBe(0);
  });
});
