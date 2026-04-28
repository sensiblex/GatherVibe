'use client';

import { memo, useState, type MouseEvent } from 'react';
import Image from 'next/image';
import { KudaGoEvent } from '../components/EventCard';
import { formatPermanentScheduleLabel, getEventCategoryBadges, shortMonth } from './utils';
import { capitalizeFirstDisplayChar } from '../lib/text';
import { proxiedImageUrl } from '../lib/imageProxy';

interface MasonryEventCardProps {
  event: KudaGoEvent;
  attendeeCount?: number;
  isViewed?: boolean;
  onClick: (event: KudaGoEvent) => void;
  onCategoryClick?: (slug: string) => void;
}

function MasonryEventCardInner({ event, attendeeCount = 0, isViewed = false, onClick, onCategoryClick }: MasonryEventCardProps) {
  const [hovered, setHovered] = useState(false);
  const displayTitle = capitalizeFirstDisplayChar(event.title);
  const coverUrl = proxiedImageUrl(event.cover_url);

  const cats = getEventCategoryBadges(event.categories);

  const handleCategoryClick = (e: MouseEvent<HTMLButtonElement>, slug: string) => {
    e.preventDefault();
    e.stopPropagation();
    onCategoryClick?.(slug);
  };

  const enhanceCategoryButton = (button: HTMLButtonElement) => {
    button.style.transform = 'translateY(-1px)';
    button.style.boxShadow = '0 2px 8px var(--primary-ring)';
  };

  const resetCategoryButton = (button: HTMLButtonElement) => {
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = 'none';
  };

  const dateDay = event.start_date
    ? event.start_date.split('-')[2].replace(/^0/, '')
    : null;
  const dateMon = event.start_date ? shortMonth(event.start_date) : null;
  const permanentScheduleLabel = formatPermanentScheduleLabel(event);

  const priceLabel = event.is_free
    ? 'Бесплатно'
    : event.price
      ? event.price
      : null;

  return (
    <div
      className="gv-masonry-card"
      onClick={() => onClick(event)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-2xl)',
        overflow: 'hidden',
        cursor: 'pointer',
        transform: hovered ? 'translateY(-5px)' : 'translateY(0)',
        boxShadow: hovered ? 'var(--shadow-lg)' : 'var(--shadow-sm)',
        transition: 'transform 220ms ease, box-shadow 220ms ease',
      }}
    >
      {isViewed && (
        <span
          className="text-xs font-bold px-2.5 py-0.5 rounded-full"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 3,
            background: event.cover_url ? 'rgba(255,255,255,0.92)' : 'var(--surface)',
            color: 'var(--primary)',
            border: '1px solid rgba(255,255,255,0.65)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            backdropFilter: 'blur(8px)',
            whiteSpace: 'nowrap',
          }}
        >
          Просмотрено
        </span>
      )}

      {/* Cover image */}
      {coverUrl ? (
        <div style={{ position: 'relative', aspectRatio: '16/10', width: '100%', overflow: 'hidden' }}>
          <Image
            src={coverUrl}
            alt={displayTitle}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            unoptimized
            style={{ objectFit: 'cover', transition: 'transform 400ms ease' }}
            onMouseEnter={e => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.05)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)'; }}
          />
          {/* Date badge over image */}
          {dateDay && (
            <div
              style={{
                position: 'absolute',
                bottom: 12,
                left: 12,
                background: 'var(--primary)',
                color: 'var(--text-inverse)',
                borderRadius: 'var(--r-lg)',
                padding: '6px 10px',
                textAlign: 'center',
                lineHeight: 1,
                boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                backdropFilter: 'blur(4px)',
                minWidth: 40,
              }}
            >
              <div style={{ fontSize: '1.25rem', fontWeight: 900 }}>{dateDay}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', marginTop: 2, opacity: 0.9 }}>
                {dateMon}
              </div>
            </div>
          )}
          {/* Gradient fade at bottom */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '50%',
              background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.45))',
              pointerEvents: 'none',
            }}
          />
        </div>
      ) : (
        /* No image — colored accent strip + date badge */
        <div
          style={{
            background: 'linear-gradient(135deg, var(--primary-hl) 0%, var(--surface-off) 100%)',
            borderBottom: '1px solid var(--border)',
            padding: '1rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
          }}
        >
          {dateDay ? (
            <div
              style={{
                background: 'var(--primary)',
                color: 'var(--text-inverse)',
                borderRadius: 'var(--r-lg)',
                padding: '8px 12px',
                textAlign: 'center',
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: '1.375rem', fontWeight: 900 }}>{dateDay}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>
                {dateMon}
              </div>
            </div>
          ) : (
            <div
              style={{
                width: 44,
                height: 52,
                borderRadius: 'var(--r-lg)',
                background: 'var(--surface-2)',
                flexShrink: 0,
              }}
            />
          )}
          {/* Category pills in the strip for no-image cards */}
          <div className="flex flex-wrap gap-1 pt-1">
            {cats.map(cat => (
              <button
                key={cat.key}
                type="button"
                onClick={e => handleCategoryClick(e, cat.slug)}
                onMouseEnter={e => enhanceCategoryButton(e.currentTarget)}
                onMouseLeave={e => resetCategoryButton(e.currentTarget)}
                onFocus={e => enhanceCategoryButton(e.currentTarget)}
                onBlur={e => resetCategoryButton(e.currentTarget)}
                aria-label={`Фильтровать по категории ${cat.label}`}
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: 'var(--primary)',
                  color: 'var(--text-inverse)',
                  opacity: 0.85,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Card body */}
      <div style={{ padding: '0.875rem 1rem 1rem' }}>
        {/* Category pills (only for cards with image) */}
        {event.cover_url && cats.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {cats.map(cat => (
              <button
                key={cat.key}
                type="button"
                onClick={e => handleCategoryClick(e, cat.slug)}
                onMouseEnter={e => enhanceCategoryButton(e.currentTarget)}
                onMouseLeave={e => resetCategoryButton(e.currentTarget)}
                onFocus={e => enhanceCategoryButton(e.currentTarget)}
                onBlur={e => resetCategoryButton(e.currentTarget)}
                aria-label={`Фильтровать по категории ${cat.label}`}
                className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                style={{
                  background: 'var(--primary-hl)',
                  color: 'var(--primary)',
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                  transition: 'transform 160ms ease, box-shadow 160ms ease, background 160ms ease',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

        {/* Title */}
        <h3
          className="font-bold leading-snug line-clamp-2 mb-2"
          style={{ color: 'var(--text)', fontSize: '0.9375rem' }}
        >
          {displayTitle}
        </h3>

        {/* Meta rows */}
        <div className="flex flex-col gap-1.5">
          {/* Time */}
          {(event.start_time || permanentScheduleLabel) && (
            <div className="flex items-center gap-1.5">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--primary)', flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 6v6l4 2"/>
              </svg>
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                {permanentScheduleLabel || (
                  <>
                    {event.start_date
                      ? new Date(...(event.start_date.split('-').map(Number) as [number, number, number]))
                          .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
                      : ''
                    }
                    {event.start_time ? ` в ${event.start_time}` : ''}
                  </>
                )}
              </span>
            </div>
          )}

          {/* Location */}
          {event.place_title && (
            <div className="flex items-center gap-1.5">
              <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--primary)', flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/>
              </svg>
              <span className="text-xs line-clamp-1" style={{ color: 'var(--text-muted)' }}>
                {event.place_title}
              </span>
            </div>
          )}

          {/* Price + attendee count row */}
          <div className="flex items-center justify-between mt-0.5 gap-2">
            {priceLabel !== null ? (
              <div className="flex items-center gap-1.5">
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: event.is_free ? 'var(--success)' : 'var(--text-muted)', flexShrink: 0 }}>
                  <rect x="2" y="7" width="20" height="14" rx="2"/><path strokeLinecap="round" d="M16 7V5a2 2 0 00-4 0v2M12 12v4"/>
                </svg>
                <span
                  className="text-xs font-semibold"
                  style={{ color: event.is_free ? 'var(--success)' : 'var(--text-muted)' }}
                >
                  {priceLabel}
                </span>
              </div>
            ) : <span />}

            {/* Attendee counter */}
            {attendeeCount > 0 && (
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{
                  background: 'var(--primary-hl)',
                  border: '1px solid var(--border)',
                }}
              >
                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--primary)', flexShrink: 0 }}>
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
                </svg>
                <span className="text-xs font-bold" style={{ color: 'var(--primary)' }}>
                  {attendeeCount}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(MasonryEventCardInner);
