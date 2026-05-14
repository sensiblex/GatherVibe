'use client';

import { useEffect, useRef, useState } from 'react';

interface DateTimePickerButtonProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
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

function toDateTimeLocalValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${mm}`;
}

export default function DateTimePickerButton({
  value,
  onChange,
  min,
  max,
  placeholder = 'Выберите дату и время',
}: DateTimePickerButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);
  const [pickerPosition, setPickerPosition] = useState({ top: 0, left: 0 });
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const pickerHeight = 450; // Примерная высота календаря
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow < pickerHeight && spaceAbove > pickerHeight) {
        // Открываем наверх
        setPickerPosition({
          top: rect.top - pickerHeight - 8,
          left: rect.left,
        });
      } else {
        // Открываем вниз
        setPickerPosition({
          top: rect.bottom + 8,
          left: rect.left,
        });
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (value) {
      const date = new Date(value);
      setSelectedHour(date.getHours());
      setSelectedMinute(date.getMinutes());
      setCurrentMonth(date);
    }
  }, [value]);

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}.${month} ${hours}:${minutes}`;
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
    const hour = selectedHour ?? 12;
    const minute = selectedMinute ?? 0;
    date.setHours(hour, minute);
    onChange(toDateTimeLocalValue(date));
  };

  const changeMonth = (delta: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1));
  };

  const isDateSelected = (timestamp: number) => {
    if (!value) return false;
    const date = new Date(timestamp);
    const selectedDate = new Date(value);
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  const days = getDaysInMonth(currentMonth);

  const handleTimeChange = () => {
    if (value && selectedHour !== null && selectedMinute !== null) {
      const date = new Date(value);
      date.setHours(selectedHour, selectedMinute);
      onChange(toDateTimeLocalValue(date));
    }
  };

  return (
    <div className="relative" ref={pickerRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '0.625rem 0.75rem',
          background: isOpen ? 'var(--primary)' : 'var(--surface-2)',
          border: `1px solid ${isOpen ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: '0.75rem',
          color: isOpen ? 'var(--text-inverse)' : value ? 'var(--text)' : 'var(--text-muted)',
          fontSize: '0.875rem',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ color: isOpen ? 'var(--text-inverse)' : 'var(--primary)', flexShrink: 0 }}
        >
          <path d="M4 10h16m-8-3V4M7 7V4m10 3V4M5 20h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Zm3-7h.01v.01H8V13Zm4 0h.01v.01H12V13Zm4 0h.01v.01H16V13Zm-8 4h.01v.01H8V17Zm4 0h.01v.01H12V17Zm4 0h.01v.01H16V17Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{value ? formatDateTime(value) : placeholder}</span>
      </button>

      {isOpen && (
        <div
          className="datepicker-picker inline-block rounded-base"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            padding: '1rem',
            position: 'fixed',
            top: pickerPosition.top,
            left: pickerPosition.left,
            zIndex: 9999,
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
                    const isDisabled = min && isoDate < min;
                    const isSelected = isDateSelected(timestamp);

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
                          background: isSelected ? 'var(--primary)' : 'transparent',
                          color: isSelected ? 'var(--text-inverse)' : isDisabled ? 'var(--text-faint)' : 'var(--text)',
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
          <div style={{ marginTop: '1rem', borderTop: '1px solid var(--divider)', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '4px' }}>Часы</label>
                <select
                  value={selectedHour ?? 12}
                  onChange={(e) => { setSelectedHour(Number(e.target.value)); handleTimeChange(); }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-base)',
                    color: 'var(--text)',
                    fontSize: '0.875rem',
                  }}
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '4px' }}>Минуты</label>
                <select
                  value={selectedMinute ?? 0}
                  onChange={(e) => { setSelectedMinute(Number(e.target.value)); handleTimeChange(); }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-base)',
                    color: 'var(--text)',
                    fontSize: '0.875rem',
                  }}
                >
                  {Array.from({ length: 60 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
