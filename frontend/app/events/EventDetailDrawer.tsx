'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect } from 'react';
import { KudaGoEvent } from '../components/EventCard';
import { translateCategory } from './utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toLabel(val: any): string {
  if (!val && val !== 0) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') return String(val.name ?? val.slug ?? val.id ?? '');
  return String(val);
}

function translateCat(raw: string): string {
  return translateCategory(raw);
}

function formatDrawerDate(dateStr: string | null, timeStr: string | null): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dateLabel = date.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  if (timeStr) {
    return `${dateLabel} в ${timeStr.slice(0, 5)}`;
  }
  return dateLabel;
}

interface EventDetailDrawerProps {
  event: KudaGoEvent;
  onClose: () => void;
}

export default function EventDetailDrawer({ event, onClose }: EventDetailDrawerProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Prevent body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const categories = (event.categories ?? [])
    .slice(0, 3)
    .map(toLabel)
    .filter(Boolean);

  const dateLabel = event.start_date
    ? formatDrawerDate(event.start_date, event.start_time)
    : event.is_permanent
    ? 'Постоянное событие'
    : null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className="fixed top-0 right-0 z-50 h-full overflow-y-auto flex flex-col"
        style={{
          width: '400px',
          maxWidth: '100vw',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          animation: 'drawerSlideIn 0.25s cubic-bezier(0.16,1,0.3,1) forwards',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 flex items-center justify-center w-8 h-8 rounded-full transition"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
          }}
          aria-label="Закрыть"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {/* Cover image */}
        {event.cover_url ? (
          <div className="relative w-full shrink-0" style={{ height: '200px' }}>
            <Image
              src={event.cover_url}
              alt={event.title}
              fill
              className="object-cover"
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          </div>
        ) : (
          <div
            className="w-full shrink-0 flex items-center justify-center"
            style={{
              height: '200px',
              background: 'linear-gradient(135deg, var(--surface-2), var(--primary-hl))',
            }}
          >
            <span className="text-6xl opacity-25">🎭</span>
          </div>
        )}

        {/* Content */}
        <div className="flex flex-col flex-1 p-6 gap-4">
          {/* Categories */}
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat, i) => (
                <span
                  key={i}
                  className="text-xs font-semibold px-2.5 py-1 rounded-full"
                  style={{
                    background: 'var(--primary-hl)',
                    color: 'var(--primary)',
                  }}
                >
                  {translateCat(cat)}
                </span>
              ))}
            </div>
          )}

          {/* Title */}
          <h2
            className="text-xl font-black leading-snug"
            style={{ color: 'var(--text)' }}
          >
            {event.title}
          </h2>

          {/* Meta info */}
          <div className="flex flex-col gap-3">
            {/* Date */}
            {dateLabel && (
              <div className="flex items-start gap-3">
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0 mt-0.5"
                  style={{ background: 'var(--primary-hl)' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-faint)' }}>
                    Дата и время
                  </p>
                  <p className="text-sm font-medium capitalize" style={{ color: 'var(--text)' }}>
                    {dateLabel}
                  </p>
                </div>
              </div>
            )}

            {/* Location */}
            {(event.place_title || event.place_address) && (
              <div className="flex items-start gap-3">
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0 mt-0.5"
                  style={{ background: 'var(--primary-hl)' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-faint)' }}>
                    Место
                  </p>
                  {event.place_title && (
                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {event.place_title}
                    </p>
                  )}
                  {event.place_address && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {event.place_address}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Price */}
            <div className="flex items-start gap-3">
              <div
                className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0 mt-0.5"
                style={{ background: 'var(--primary-hl)' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}>
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-faint)' }}>
                  Стоимость
                </p>
                {event.is_free ? (
                  <p className="text-sm font-bold" style={{ color: 'var(--success)' }}>Бесплатно</p>
                ) : event.price ? (
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{event.price}</p>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Уточняйте у организатора</p>
                )}
              </div>
            </div>
          </div>

          {/* CTA button */}
          <div className="mt-auto pt-4" style={{ borderTop: '1px solid var(--divider)' }}>
            <Link
              href={`/events/${event.kudago_id}`}
              className="flex items-center justify-center gap-2 w-full py-3 px-6 rounded-2xl font-bold text-sm transition"
              style={{
                background: 'var(--primary)',
                color: 'var(--text-inverse)',
              }}
            >
              Подробнее о событии
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* Slide-in animation keyframes injected inline */}
      <style>{`
        @keyframes drawerSlideIn {
          from { transform: translateX(100%); opacity: 0.6; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}
