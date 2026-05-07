'use client';

import { useState, useEffect, useRef } from 'react';
import { localIsoDate } from './utils';
import MiniCalendar from './MiniCalendar';

const DOW_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']; // 0=Sun
const STEP = 7;
const VISIBLE = 11;

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isoDate(d: Date): string {
  return localIsoDate(d);
}

interface DateStripProps {
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  eventDates?: Set<string>;
}

// ─── Single day cell ─────────────────────────────────────────────────────────
function DayCell({
  day, dowLabel, isWeekend, isToday, isSelected, hasEvent, onClick,
}: {
  day: number; dowLabel: string; isWeekend: boolean;
  isToday: boolean; isSelected: boolean; hasEvent: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  const bg = isSelected
    ? 'var(--primary)'
    : hovered
      ? 'var(--primary-hl)'
      : 'transparent';

  const numColor = isSelected
    ? '#fff'
    : isWeekend
      ? '#ef4444'
      : 'var(--text)';

  const dowColor = isSelected
    ? 'rgba(255,255,255,0.75)'
    : isWeekend
      ? '#ef4444'
      : 'var(--text-muted)';

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '8px 10px 10px',
        borderRadius: 'var(--r-xl)',
        background: bg,
        border: isToday && !isSelected ? '2px solid var(--primary)' : '2px solid transparent',
        cursor: 'pointer',
        flex: 1,
        minWidth: 44,
        position: 'relative',
        transform: hovered && !isSelected ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hovered && !isSelected ? 'var(--shadow-md)' : 'none',
        transition: 'all 180ms cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      <span style={{ fontSize: '1.5rem', fontWeight: 900, lineHeight: 1, color: numColor }}>
        {day}
      </span>
      <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: dowColor, textTransform: 'lowercase' }}>
        {dowLabel}
      </span>
      {hasEvent && !isSelected && (
        <span
          style={{
            position: 'absolute',
            bottom: 4,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: isWeekend ? '#ef4444' : 'var(--primary)',
          }}
        />
      )}
    </button>
  );
}

// ─── Month separator ─────────────────────────────────────────────────────────
function MonthSep({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 6px',
        flexShrink: 0,
        width: 20,
        height: '100%',
      }}
    >
      <span
        style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          color: 'var(--text-faint)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          writingMode: 'vertical-lr',
          textOrientation: 'mixed',
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </div>
  );
}

const MONTH_ABR = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

// ─── Main DateStrip ───────────────────────────────────────────────────────────
export default function DateStrip({ selectedDate, onSelectDate, eventDates }: DateStripProps) {
  const today = new Date();
  const todayIso = isoDate(today);

  // Offset of the first visible day from today
  const [startOffset, setStartOffset] = useState(-2);
  // Animation direction for the strip
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const [animKey, setAnimKey] = useState(0);

  const [showCalendar, setShowCalendar] = useState(false);
  const calPopupRef = useRef<HTMLDivElement>(null);
  const calBtnRef = useRef<HTMLButtonElement>(null);

  // Close popup on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        calPopupRef.current && !calPopupRef.current.contains(e.target as Node) &&
        calBtnRef.current && !calBtnRef.current.contains(e.target as Node)
      ) {
        setShowCalendar(false);
      }
    }
    if (showCalendar) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showCalendar]);

  function navigate(dir: 'prev' | 'next') {
    setDirection(dir === 'next' ? 'left' : 'right');
    setStartOffset(o => o + (dir === 'next' ? STEP : -STEP));
    setAnimKey(k => k + 1);
  }

  // Build visible day list with month separators
  const firstDay = addDays(today, startOffset);
  type Item =
    | { type: 'day'; date: Date; iso: string }
    | { type: 'month'; label: string };

  const items: Item[] = [];
  for (let i = 0; i < VISIBLE; i++) {
    const d = addDays(firstDay, i);
    // Insert month label before the 1st of a month (but not before the very first day)
    if (i > 0 && d.getDate() === 1) {
      items.push({ type: 'month', label: MONTH_ABR[d.getMonth()] });
    }
    items.push({ type: 'day', date: d, iso: isoDate(d) });
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        className="flex items-center gap-2"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-2xl)',
          padding: '0.625rem 0.875rem',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'visible',
        }}
      >
        {/* ── Calendar icon button ── */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            ref={calBtnRef}
            onClick={() => setShowCalendar(v => !v)}
            className="flex items-center justify-center rounded-xl transition"
            style={{
              width: 44,
              height: 56,
              background: showCalendar ? 'var(--primary-hl)' : 'var(--surface-2)',
              border: `1px solid ${showCalendar ? 'var(--primary)' : 'var(--border)'}`,
              color: showCalendar ? 'var(--primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              flexShrink: 0,
              transform: showCalendar ? 'scale(1.05)' : 'scale(1)',
              transition: 'all 160ms ease',
            }}
            aria-label="Открыть календарь"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </button>

          {/* Popup calendar */}
          {showCalendar && (
            <div
              ref={calPopupRef}
              style={{
                position: 'absolute',
                top: 'calc(100% + 10px)',
                left: 0,
                zIndex: 100,
                animation: 'gvCalPopIn 200ms cubic-bezier(0.34,1.56,0.64,1)',
              }}
            >
              <MiniCalendar
                selectedDate={selectedDate}
                onSelectDate={(d) => {
                  onSelectDate(d);
                  setShowCalendar(false);
                }}
                eventDates={eventDates}
              />
            </div>
          )}
        </div>

        {/* ── Divider ── */}
        <div style={{ width: 1, height: 40, background: 'var(--divider)', flexShrink: 0 }} />

        {/* ── Left arrow ── */}
        <button
          onClick={() => navigate('prev')}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 36,
            height: 36,
            background: 'var(--primary)',
            color: '#fff',
            flexShrink: 0,
            cursor: 'pointer',
            border: 'none',
            fontSize: '1.1rem',
            fontWeight: 700,
            boxShadow: '0 2px 8px var(--primary-ring)',
            transition: 'transform 160ms, box-shadow 160ms',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.12)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px var(--primary-ring)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px var(--primary-ring)';
          }}
          aria-label="Предыдущие дни"
        >
          ‹
        </button>

        {/* ── Day strip ── */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div
            key={animKey}
            className={direction === 'left' ? 'gv-strip-enter-left' : 'gv-strip-enter-right'}
            style={{ display: 'flex', alignItems: 'center', gap: 0 }}
          >
            {items.map((item, idx) =>
              item.type === 'month' ? (
                <MonthSep key={`m-${idx}`} label={item.label} />
              ) : (
                <DayCell
                  key={item.iso}
                  day={item.date.getDate()}
                  dowLabel={DOW_SHORT[item.date.getDay()]}
                  isWeekend={item.date.getDay() === 0 || item.date.getDay() === 6}
                  isToday={item.iso === todayIso}
                  isSelected={item.iso === selectedDate}
                  hasEvent={eventDates?.has(item.iso) ?? false}
                  onClick={() => onSelectDate(selectedDate === item.iso ? null : item.iso)}
                />
              )
            )}
          </div>
        </div>

        {/* ── Right arrow ── */}
        <button
          onClick={() => navigate('next')}
          className="flex items-center justify-center rounded-full"
          style={{
            width: 36,
            height: 36,
            background: 'var(--primary)',
            color: '#fff',
            flexShrink: 0,
            cursor: 'pointer',
            border: 'none',
            fontSize: '1.1rem',
            fontWeight: 700,
            boxShadow: '0 2px 8px var(--primary-ring)',
            transition: 'transform 160ms, box-shadow 160ms',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.12)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px var(--primary-ring)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
            (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 8px var(--primary-ring)';
          }}
          aria-label="Следующие дни"
        >
          ›
        </button>
      </div>
    </div>
  );
}
