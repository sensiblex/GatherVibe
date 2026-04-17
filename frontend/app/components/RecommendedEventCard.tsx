'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import type { RecommendedEvent } from '../hooks/useRecommendedEvents';

function scoreColor(score: number): string {
  if (score >= 70) return '#16a34a';
  if (score >= 40) return '#d97706';
  return '#64748b';
}

function formatDate(ts: number | null): string | null {
  if (!ts) return null;
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Props {
  event: RecommendedEvent;
  onDismiss?: (eventId: string) => void;
  onLike?: (eventId: string, score: number) => void;
}

export default function RecommendedEventCard({ event, onDismiss, onLike }: Props) {
  const color = scoreColor(event.match_score);
  const dateLabel = formatDate(event.start_ts);
  const [liked, setLiked] = useState(false);

  return (
    <div
      className="relative flex-shrink-0 w-[320px] md:w-auto rounded-2xl overflow-hidden transition hover:-translate-y-0.5"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <Link href={`/events/${event.event_id}`} className="block">
        <div className="relative w-full h-40 bg-gray-100">
          {event.cover_url ? (
            <Image
              src={event.cover_url}
              alt={event.title}
              fill
              sizes="320px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl">🎭</div>
          )}
          <span
            className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold text-white"
            style={{ background: color, boxShadow: 'var(--shadow-sm)' }}
          >
            {event.match_score}% совпадение
          </span>
        </div>

        <div className="p-4">
          <h3
            className="text-base font-bold mb-1 line-clamp-2"
            style={{ color: 'var(--text)' }}
          >
            {event.title}
          </h3>

          {dateLabel && (
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              {dateLabel}
            </p>
          )}

          {event.match_reasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {event.match_reasons.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                  style={{
                    background: 'var(--primary-hl)',
                    color: 'var(--primary)',
                  }}
                >
                  {r}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-xs">
            <span style={{ color: 'var(--text-muted)' }}>
              {event.is_free ? 'Бесплатно' : event.price || 'Платно'}
            </span>
            <span className="font-semibold" style={{ color: 'var(--primary)' }}>
              Подробнее →
            </span>
          </div>
        </div>
      </Link>

      {(onDismiss || onLike) && (
        <div
          className="absolute top-3 right-3 flex gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {onLike && (
            <button
              type="button"
              aria-label="Нравится"
              title="Нравится"
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition"
              style={{
                background: liked ? 'var(--primary)' : 'var(--surface)',
                color: liked ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
              }}
              onClick={() => {
                setLiked(true);
                onLike(event.event_id, event.match_score);
              }}
            >
              👍
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              aria-label="Скрыть"
              title="Не интересно"
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition"
              style={{
                background: 'var(--surface)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
              }}
              onClick={() => onDismiss(event.event_id)}
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
