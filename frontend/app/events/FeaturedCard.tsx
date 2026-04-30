'use client';

import { memo, useState, type MouseEvent } from 'react';
import Image from 'next/image';
import { KudaGoEvent } from '../components/EventCard';
import { getEventCategoryBadges, shortMonth } from './utils';
import { capitalizeFirstDisplayChar } from '../lib/text';
import { proxiedImageUrl } from '../lib/imageProxy';

interface FeaturedCardProps {
  event: KudaGoEvent;
  attendeeCount?: number;
  isViewed?: boolean;
  onClick: (event: KudaGoEvent) => void;
  onCategoryClick?: (slug: string) => void;
}

function FeaturedCardInner({ event, attendeeCount = 0, isViewed = false, onClick, onCategoryClick }: FeaturedCardProps) {
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
    button.style.background = 'rgba(255,255,255,0.28)';
    button.style.transform = 'translateY(-1px)';
  };

  const resetCategoryButton = (button: HTMLButtonElement) => {
    button.style.background = 'rgba(255,255,255,0.18)';
    button.style.transform = 'translateY(0)';
  };

  const dateDay = event.start_date ? event.start_date.split('-')[2].replace(/^0/, '') : null;
  const dateMon = event.start_date ? shortMonth(event.start_date) : null;
  const dateYear = event.start_date ? event.start_date.split('-')[0] : null;

  const fullDate = event.start_date
    ? new Date(...(event.start_date.split('-').map(Number) as [number, number, number]))
        .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    : null;

  const priceLabel = event.is_free ? 'Бесплатно' : event.price || null;

  return (
    <div
      onClick={() => onClick(event)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        borderRadius: 'var(--r-2xl)',
        overflow: 'hidden',
        cursor: 'pointer',
        aspectRatio: '21/9',
        minHeight: 280,
        boxShadow: hovered ? 'var(--shadow-lg)' : 'var(--shadow-md)',
        transform: hovered ? 'scale(1.008)' : 'scale(1)',
        transition: 'transform 300ms ease, box-shadow 300ms ease',
      }}
    >
      {/* Background image */}
      {coverUrl ? (
        <Image
          src={coverUrl}
          alt={displayTitle}
          fill
          priority
          sizes="100vw"
          unoptimized
          style={{
            objectFit: 'cover',
            transform: hovered ? 'scale(1.05)' : 'scale(1)',
            transition: 'transform 500ms ease',
          }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, var(--primary) 0%, #a855f7 100%)' }} />
      )}

      {/* Dark gradient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.1) 100%)',
        }}
      />

      {/* Top-left: category badges */}
      <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', gap: 6 }}>
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
            className="text-xs font-bold px-3 py-1 rounded-full"
            style={{
              background: 'rgba(255,255,255,0.18)',
              color: '#fff',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.3)',
              cursor: 'pointer',
              letterSpacing: '0.02em',
              transition: 'background 160ms ease, transform 160ms ease',
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Top-right: attendee count */}
      {(isViewed || attendeeCount > 0) && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(8px)',
            borderRadius: 'var(--r-full)',
            padding: '5px 12px',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          {isViewed && (
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>
              Просмотрено
            </span>
          )}
          <svg
            width="14"
            height="14"
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            viewBox="0 0 24 24"
            style={{ display: attendeeCount > 0 ? 'block' : 'none' }}
          >
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
          </svg>
          <span style={{ display: attendeeCount > 0 ? 'inline' : 'none', fontSize: '0.8125rem', fontWeight: 700, color: '#fff' }}>
            {attendeeCount} идут
          </span>
        </div>
      )}

      {/* Bottom content */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: '1rem',
        }}
      >
        {/* Left: date badge + title + meta */}
        <div style={{ flex: 1 }}>
          {/* Date badge */}
          {dateDay && (
            <div style={{ marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  background: 'var(--primary)',
                  color: '#fff',
                  borderRadius: 'var(--r-lg)',
                  padding: '4px 12px',
                  fontSize: '0.8125rem',
                  fontWeight: 800,
                  letterSpacing: '0.01em',
                }}
              >
                {fullDate}{event.start_time ? ` · ${event.start_time}` : ''}
              </span>
            </div>
          )}

          <h2
            className="font-black leading-tight"
            style={{
              color: '#fff',
              fontSize: 'clamp(1.25rem, 2.5vw, 1.875rem)',
              textShadow: '0 1px 8px rgba(0,0,0,0.5)',
              marginBottom: 8,
              lineClamp: 2,
              WebkitLineClamp: 2,
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {displayTitle}
          </h2>

          {/* Location */}
          {event.place_title && (
            <div className="flex items-center gap-1.5">
              <svg width="13" height="13" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"/>
              </svg>
              <span style={{ fontSize: '0.8125rem', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
                {event.place_title}
              </span>
            </div>
          )}
        </div>

        {/* Right: price + CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
          {priceLabel && (
            <span
              style={{
                fontSize: '0.875rem',
                fontWeight: 800,
                color: event.is_free ? '#4ade80' : '#fff',
              }}
            >
              {priceLabel}
            </span>
          )}
          <button
            style={{
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--r-xl)',
              padding: '0.625rem 1.25rem',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              boxShadow: '0 2px 12px var(--primary-ring)',
              transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
              transition: 'transform 200ms ease',
              whiteSpace: 'nowrap',
            }}
          >
            Подробнее →
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(FeaturedCardInner);
