'use client';

import { useEffect, useRef, useState } from 'react';

interface DatePickerProps {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  minDate?: string;
  label?: string;
}

const monthNames = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const weekDays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function DatePicker({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  minDate,
  label = 'Дата создания',
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [activeInput, setActiveInput] = useState<'from' | 'to'>('from');
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const prevDate = new Date(year, month, -i);
      days.push({ date: prevDate, isCurrentMonth: false, timestamp: prevDate.getTime() });
    }

    for (let i = 1; i <= daysInMonth; i++) {
      const currentDate = new Date(year, month, i);
      days.push({ date: currentDate, isCurrentMonth: true, timestamp: currentDate.getTime() });
    }

    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      const nextDate = new Date(year, month + 1, i);
      days.push({ date: nextDate, isCurrentMonth: false, timestamp: nextDate.getTime() });
    }

    return days;
  };

  const handleDayClick = (timestamp: number) => {
    const date = new Date(timestamp);
    const isoDate = toDateInputValue(date);

    if (activeInput === 'from') {
      onDateFromChange(isoDate);
      if (dateTo && isoDate > dateTo) {
        onDateToChange(isoDate);
      }
      setActiveInput('to');
    } else {
      onDateToChange(isoDate);
      if (dateFrom && isoDate < dateFrom) {
        onDateFromChange(isoDate);
      }
    }
  };

  const changeMonth = (delta: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1));
  };

  const isDateSelected = (timestamp: number) => {
    const date = new Date(timestamp);
    const isoDate = toDateInputValue(date);
    return isoDate === dateFrom || isoDate === dateTo;
  };

  const isDateInRange = (timestamp: number) => {
    if (!dateFrom || !dateTo) return false;
    const date = new Date(timestamp);
    const isoDate = toDateInputValue(date);
    return isoDate > dateFrom && isoDate < dateTo;
  };

  const days = getDaysInMonth(currentMonth);

  return (
    <div className="relative" ref={pickerRef}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          aria-label={`${label}: от`}
          onClick={() => { setIsOpen(!isOpen); setActiveInput('from'); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flex: 1,
            padding: '0.625rem 0.75rem',
            background: activeInput === 'from' && isOpen ? 'var(--primary)' : 'var(--surface-2)',
            border: `1px solid ${activeInput === 'from' && isOpen ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: '0.75rem',
            color: activeInput === 'from' && isOpen ? 'var(--text-inverse)' : 'var(--text)',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: activeInput === 'from' && isOpen ? 'var(--text-inverse)' : 'var(--primary)', flexShrink: 0 }}>
            <path d="M4 10h16m-8-3V4M7 7V4m10 3V4M5 20h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Zm3-7h.01v.01H8V13Zm4 0h.01v.01H12V13Zm4 0h.01v.01H16V13Zm-8 4h.01v.01H8V17Zm4 0h.01v.01H12V17Zm4 0h.01v.01H16V17Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{dateFrom ? formatDateShort(dateFrom) : 'От'}</span>
        </button>
        <span style={{ color: 'var(--text-faint)', fontSize: '0.875rem' }}>-</span>
        <button
          type="button"
          aria-label={`${label}: до`}
          onClick={() => { setIsOpen(!isOpen); setActiveInput('to'); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flex: 1,
            padding: '0.625rem 0.75rem',
            background: activeInput === 'to' && isOpen ? 'var(--primary)' : 'var(--surface-2)',
            border: `1px solid ${activeInput === 'to' && isOpen ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: '0.75rem',
            color: activeInput === 'to' && isOpen ? 'var(--text-inverse)' : 'var(--text)',
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: activeInput === 'to' && isOpen ? 'var(--text-inverse)' : 'var(--primary)', flexShrink: 0 }}>
            <path d="M4 10h16m-8-3V4M7 7V4m10 3V4M5 20h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Zm3-7h.01v.01H8V13Zm4 0h.01v.01H12V13Zm4 0h.01v.01H16V13Zm-8 4h.01v.01H8V17Zm4 0h.01v.01H12V17Zm4 0h.01v.01H16V17Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{dateTo ? formatDateShort(dateTo) : 'До'}</span>
        </button>
      </div>

      {isOpen && (
        <div
          className="datepicker-picker inline-block rounded-base"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            padding: '1rem',
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '8px',
            zIndex: 1000,
            width: '320px',
          }}
        >
          <div className="datepicker-header">
            <div className="datepicker-controls flex justify-between mb-2">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                style={{
                  background: 'var(--surface-2)',
                  borderRadius: 'var(--r-base)',
                  color: 'var(--text)',
                  padding: '0.625rem',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 5H1m0 0 4 4M1 5l4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                style={{
                  background: 'var(--surface-2)',
                  borderRadius: 'var(--r-base)',
                  color: 'var(--text)',
                  padding: '0.625rem 1.25rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}
              >
                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </button>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                style={{
                  background: 'var(--surface-2)',
                  borderRadius: 'var(--r-base)',
                  color: 'var(--text)',
                  padding: '0.625rem',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 5h12m0 0L9 1m4 4L9 9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
          <div className="datepicker-main p-1" style={{ width: '100%' }}>
            <div className="datepicker-view flex" style={{ width: '100%' }}>
              <div className="days" style={{ width: '100%' }}>
                <div className="days-of-week" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, marginBottom: 4, width: '100%' }}>
                  {weekDays.map(day => (
                    <span
                      key={day}
                      style={{
                        textAlign: 'center',
                        height: '24px',
                        lineHeight: '24px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {day}
                    </span>
                  ))}
                </div>
                <div className="datepicker-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4, width: '100%' }}>
                  {days.map(({ date, isCurrentMonth, timestamp }) => {
                    const isoDate = toDateInputValue(date);
                    const isDisabled = minDate && isoDate < minDate;
                    const isSelected = isDateSelected(timestamp);
                    const inRange = isDateInRange(timestamp);

                    return (
                      <span
                        key={timestamp}
                        onClick={() => !isDisabled && handleDayClick(timestamp)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          aspectRatio: '1',
                          width: '100%',
                          border: 'none',
                          borderRadius: 'var(--r-base)',
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: 500,
                          opacity: isCurrentMonth ? 1 : 0.3,
                          background: isSelected
                            ? 'var(--primary)'
                            : inRange
                              ? 'var(--primary-hl)'
                              : 'transparent',
                          color: isSelected
                            ? 'var(--text-inverse)'
                            : isDisabled
                              ? 'var(--text-faint)'
                              : 'var(--text)',
                        }}
                      >
                        {date.getDate()}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
