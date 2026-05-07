'use client';

interface Props {
  startingWithinHours: number | null;
  durationMode: 'short' | 'long' | null;
  hasSchedules: boolean;
  onlyVerifiedPlace: boolean;
  onChange: (patch: {
    startingWithinHours?: number | null;
    durationMode?: 'short' | 'long' | null;
    hasSchedules?: boolean;
    onlyVerifiedPlace?: boolean;
  }) => void;
}

function chip(on: boolean) {
  return {
    padding: '0.4rem 0.9rem',
    borderRadius: 'var(--r-full)',
    fontSize: '.8125rem',
    background: on ? 'var(--primary)' : 'var(--surface-2)',
    color: on ? 'var(--text-inverse)' : 'var(--text-muted)',
    border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
    cursor: 'pointer',
    fontWeight: 600,
    boxShadow: on ? '0 2px 8px var(--primary-ring)' : 'none',
  } as const;
}

export default function TimingFilters({
  startingWithinHours, durationMode, hasSchedules, onlyVerifiedPlace, onChange,
}: Props) {
  const toggleSoon = (h: number) =>
    onChange({ startingWithinHours: startingWithinHours === h ? null : h });
  // Short and Long are mutually exclusive — clicking one while the other is active
  // switches to the new mode rather than keeping both on.
  const toggleDur = (m: 'short' | 'long') =>
    onChange({ durationMode: durationMode === m ? null : m });

  return (
    <div className="flex flex-wrap gap-2" aria-label="Тайминг и расписание">
      <button aria-pressed={startingWithinHours === 2} onClick={() => toggleSoon(2)} style={chip(startingWithinHours === 2)}>
        ⚡ Скоро (2ч)
      </button>
      <button aria-pressed={startingWithinHours === 4} onClick={() => toggleSoon(4)} style={chip(startingWithinHours === 4)}>
        ⚡ Скоро (4ч)
      </button>
      <button aria-pressed={durationMode === 'short'} onClick={() => toggleDur('short')} style={chip(durationMode === 'short')}>
        ⏱ Короткое
      </button>
      <button aria-pressed={durationMode === 'long'} onClick={() => toggleDur('long')} style={chip(durationMode === 'long')}>
        📅 Многодневное
      </button>
      <button aria-pressed={hasSchedules} onClick={() => onChange({ hasSchedules: !hasSchedules })} style={chip(hasSchedules)}>
        🔁 Регулярное
      </button>
      <button aria-pressed={onlyVerifiedPlace} onClick={() => onChange({ onlyVerifiedPlace: !onlyVerifiedPlace })} style={chip(onlyVerifiedPlace)}>
        ✅ Проверенная площадка
      </button>
    </div>
  );
}
