const DEFAULT_API_BASE = '/api';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

function isAbsoluteHttpUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

export function resolveApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return DEFAULT_API_BASE;
  if (!isAbsoluteHttpUrl(raw)) return raw;
  if (typeof window === 'undefined') return raw;

  try {
    const target = new URL(raw);
    const current = window.location;
    const sameOrigin = target.origin === current.origin;
    const loopbackMismatch =
      LOOPBACK_HOSTS.has(target.hostname) &&
      LOOPBACK_HOSTS.has(current.hostname) &&
      target.origin !== current.origin;
    if (!sameOrigin && loopbackMismatch) {
      return DEFAULT_API_BASE;
    }
  } catch {
    return DEFAULT_API_BASE;
  }

  return raw;
}

