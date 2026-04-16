'use client';

import { useState, useMemo } from 'react';
import { localIsoDate } from './utils';

interface MiniCalendarProps {
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  eventDates?: Set<string>;
}

const DOW_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function getDaysGrid(year: number, month: number): { iso: string; day: number; inMonth: boolean }[] {
  const firstDay = new Date(year, month, 1);
  // Monday-first: 0=Mon … 6=Sun
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: { iso: string; day: number; inMonth: boolean }[] = [];

  // Prev month trailing days
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i);
    cells.push({ iso: localIsoDate(d), day: d.getDate(), inMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: localIsoDate(new Date(year, month, d)), day: d, inMonth: true });
  }

  // Next month leading days (fill to 42 cells = 6 weeks)
  let next = 1;
  while (cells.length < 42) {
    const d = new Date(year, month + 1, next++);
    cells.push({ iso: localIsoDate(d), day: d.getDate(), inMonth: false });
  }

  return cells;
}

export default function MiniCalendar({ selectedDate, onSelectDate, eventDates }: MiniCalendarProps) {
  const todayIso = localIsoDate(new Date());
  const todayDate = new Date();

  const [viewYear, setViewYear] = useState(todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth());

  const cells = useMemo(() => getDaysGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const monthLabel = (() => {
    const s = new Date(viewYear, viewMonth, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1).replace(' г.', '');
  })();

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function goToday() {
    setViewYear(todayDate.getFullYear());
    setViewMonth(todayDate.getMonth());
  }

  function handleDayClick(iso: string) {
    onSelectDate(selectedDate === iso ? null : iso);
  }

  return (
    <div
      className="gv-card mx-auto"
      style={{ maxWidth: 340, padding: '1rem', userSelect: 'none' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={goToday}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
          style={{
            background: 'var(--primary-hl)',
            color: 'var(--primary)',
            border: '1px solid var(--border)',
          }}
        >
          Сегодня
        </button>

        <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>
          {monthLabel}
        </span>

        <div className="flex gap-1">
          <button
            onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-base transition hover:scale-110"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            aria-label="Предыдущий месяц"
          >‹</button>
          <button
            onClick={nextMonth}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-base transition hover:scale-110"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            aria-label="Следующий месяц"
          >›</button>
        </div>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', marginBottom: '4px' }}>
        {DOW_LABELS.map(d => (
          <div
            key={d}
            className="text-center text-xs font-semibold"
            style={{ color: 'var(--text-faint)', padding: '4px 0' }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {cells.map(({ iso, day, inMonth }) => {
          const isToday    = iso === todayIso;
          const isSelected = iso === selectedDate;
          const hasEvent   = eventDates?.has(iso) ?? false;

          return (
            <button
              key={iso}
              onClick={() => handleDayClick(iso)}
              className={`gv-mini-cal-day${isToday && !isSelected ? ' gv-mini-cal-day--today' : ''}${isSelected ? ' gv-mini-cal-day--selected' : ''}${!inMonth ? ' gv-mini-cal-day--off' : ''}`}
            >
              {day}
              {hasEvent && !isSelected && <span className="gv-mini-cal-dot" />}
            </button>
          );
        })}
      </div>

      {/* Selected date hint */}
      {selectedDate && (
        <div className="mt-3 text-center">
          <button
            onClick={() => onSelectDate(null)}
            className="text-xs font-medium transition"
            style={{ color: 'var(--primary)' }}
          >
            Сбросить дату ×
          </button>
        </div>
      )}
    </div>
  );
}
