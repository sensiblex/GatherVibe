import { capitalizeFirstDisplayChar } from './text';

function normalizeTitle(title: string | null | undefined): string | null {
  if (typeof title !== 'string') return null;
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveEventIdentityTitle(eventTitle: string | null | undefined, eventId: string): string {
  const normalized = normalizeTitle(eventTitle);
  if (!normalized) return `Событие #${eventId}`;
  return capitalizeFirstDisplayChar(normalized);
}

export function formatEventIdentityDateLabel(
  eventDateTs: number | null | undefined,
  locale = 'ru-RU',
): string | null {
  if (typeof eventDateTs !== 'number' || Number.isNaN(eventDateTs)) return null;
  const date = new Date(eventDateTs * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function buildEventIdentityMeta(params: {
  eventId: string;
  eventTitle?: string | null;
  eventDateTs?: number | null;
}) {
  return {
    title: resolveEventIdentityTitle(params.eventTitle, params.eventId),
    dateLabel: formatEventIdentityDateLabel(params.eventDateTs),
    href: `/events/${params.eventId}`,
  };
}

