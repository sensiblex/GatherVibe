const PROXIED_IMAGE_HOSTS = new Set(['media.kudago.com']);

export function proxiedImageUrl(src: string | null | undefined): string | null {
  if (!src) return null;

  try {
    const url = new URL(src);
    if (url.protocol === 'https:' && PROXIED_IMAGE_HOSTS.has(url.hostname)) {
      return `/image-proxy?url=${encodeURIComponent(src)}`;
    }
  } catch {
    return src;
  }

  return src;
}
