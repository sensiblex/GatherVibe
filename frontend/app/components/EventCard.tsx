'use client';

import Image from 'next/image';
import Link from 'next/link';
import { getCategoryBadges } from '../lib/kudagoUi';
import type { KudaGoEvent } from '../lib/kudagoUi';
import { formatEventDateTimeLabel, formatPermanentScheduleLabel } from '../events/utils';
import { capitalizeFirstDisplayChar } from '../lib/text';
import { proxiedImageUrl } from '../lib/imageProxy';
export type { KudaGoEvent, KudaGoParty, UnknownTagLike } from '../lib/kudagoUi';
function formatDate(dateStr: string | null, timeStr: string | null): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const eventDate = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Don't show date for past events
  if (eventDate < today) {
    return '';
  }

  return formatEventDateTimeLabel(dateStr, timeStr, { month: 'short' });
}

interface AttendeeBasic {
  user_id: number;
  username: string;
  avatar_url?: string | null;
}

// ──────────────────────────────────────────────────────────────────────
export default function EventCard({ event, attendees = [] }: { event: KudaGoEvent; attendees?: AttendeeBasic[] }) {
  const ageLabel = event.age_restriction ? (typeof event.age_restriction === 'string' && event.age_restriction.endsWith('+') ? event.age_restriction : `${event.age_restriction}+`) : null;
  const displayTitle = capitalizeFirstDisplayChar(event.title);
  const coverUrl = proxiedImageUrl(event.cover_url);
  const permanentScheduleLabel = formatPermanentScheduleLabel(event);

  return (
    <Link
      href={`/events/${event.kudago_id}`}
      className="group flex flex-col rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* IMAGE */}
      <div
        className="relative w-full h-48 overflow-hidden"
        style={{ background: 'var(--surface-2)' }}
      >
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt={displayTitle}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--surface-2), var(--surface-off))' }}>
            <span className="text-5xl opacity-30">🎭</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

        <div className="absolute top-3 left-3 flex gap-1.5">
          {event.is_free && (
            <span className="bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">
              Бесплатно
            </span>
          )}
          {ageLabel && (
            <span className="bg-black/50 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {ageLabel}
            </span>
          )}
        </div>

        {(formatDate(event.start_date, event.start_time) || permanentScheduleLabel) && (
          <span
            className="absolute bottom-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-md"
            style={{
              background: 'rgba(0,0,0,0.62)',
              color: '#ffffff',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          >
            {formatDate(event.start_date, event.start_time) || permanentScheduleLabel}
          </span>
        )}
      </div>

      {/* BODY */}
      <div className="flex flex-col flex-1 p-4 gap-2">
        {event.categories?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {getCategoryBadges(event.categories, 2).map(({ key, label }) => {
              return (
                <span
                  key={key}
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{
                    background: 'var(--primary-hl)',
                    color: 'var(--primary)',
                  }}
                >
                  {label}
                </span>
              );
            })}
          </div>
        )}

        <h3
          className="font-bold text-base leading-snug line-clamp-2 transition-colors"
          style={{ color: 'var(--text)' }}
        >
          {displayTitle}
        </h3>

        {event.place_title && (
          <div
            className="flex items-center gap-1.5 text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="line-clamp-1">{event.place_title}</span>
          </div>
        )}

        {/* FOOTER */}
        <div
          className="mt-auto pt-3 flex items-center justify-between gap-2"
          style={{ borderTop: '1px solid var(--divider)' }}
        >
          {/* Цена */}
          <div>
            {event.is_free ? (
              <span className="font-bold text-sm" style={{ color: 'var(--success)' }}>Бесплатно</span>
            ) : event.price ? (
              <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>{event.price}</span>
            ) : (
              <span className="text-sm" style={{ color: 'var(--text-faint)' }}>—</span>
            )}
          </div>

          {/* ── Мини-аватары + счётчик + ссылка ── */}
          <div className="flex items-center gap-3">
            {attendees.length > 0 && (
              <div className="flex items-center gap-1.5">
                {/* Мини-аватары первых 3 участников */}
                <div className="flex -space-x-2">
                  {attendees.slice(0, 3).map((a, i) => (
                    <div
                      key={a.user_id}
                      className="w-6 h-6 rounded-full overflow-hidden border-2 shrink-0"
                      style={{
                        borderColor: 'var(--surface)',
                        zIndex: 3 - i,
                        position: 'relative',
                      }}
                      title={a.username}
                    >
                      {a.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.avatar_url}
                          alt={a.username}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-white font-bold"
                          style={{
                            fontSize: '9px',
                            background: 'linear-gradient(135deg, var(--primary), #a855f7)',
                          }}
                        >
                          {a.username.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <span className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
                  {attendees.length} идут
                </span>
              </div>
            )}
            <span
              className="text-xs font-medium"
              style={{ color: 'var(--primary)' }}
            >
              Подробнее →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
