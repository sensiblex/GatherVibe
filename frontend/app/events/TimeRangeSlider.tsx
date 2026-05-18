'use client';

import { useMemo } from 'react';

interface Props {
  from: number | null;  // 0..24
  to:   number | null;  // 0..24
  onChange: (from: number | null, to: number | null) => void;
}

const MIN = 0;
const MAX = 24;
const fmt = (h: number) => `${String(h).padStart(2, '0')}:00`;

export default function TimeRangeSlider({ from, to, onChange }: Props) {
  const active = from !== null && to !== null && !(from === MIN && to === MAX);
  const curFrom = from ?? MIN;
  const curTo   = to   ?? MAX;

  // Progress bar gradient between thumbs (overnight wrap = two fills).
  const fillStyle = useMemo(() => {
    const pct = (v: number) => ((v - MIN) / (MAX - MIN)) * 100;
    if (curFrom <= curTo) {
      const a = pct(curFrom), b = pct(curTo);
      return {
        background: `linear-gradient(90deg,
          var(--surface-2) 0%, var(--surface-2) ${a}%,
          var(--primary) ${a}%, var(--primary) ${b}%,
          var(--surface-2) ${b}%, var(--surface-2) 100%)`,
      };
    }
    // overnight wrap 22..4 — fill [0..to] and [from..24]
    const a = pct(curTo), b = pct(curFrom);
    return {
      background: `linear-gradient(90deg,
        var(--primary) 0%, var(--primary) ${a}%,
        var(--surface-2) ${a}%, var(--surface-2) ${b}%,
        var(--primary) ${b}%, var(--primary) 100%)`,
    };
  }, [curFrom, curTo]);

  const setFrom = (v: number) => onChange(v, to ?? MAX);
  const setTo   = (v: number) => onChange(from ?? MIN, v);
  const reset   = () => onChange(null, null);

  const label = active
    ? `${fmt(curFrom)} — ${fmt(curTo === 24 ? 0 : curTo)}${curFrom > curTo ? ' +1д' : ''}`
    : 'Любое время';

  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 14,
        padding: '10px 14px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-2xl)',
      }}
      aria-label="Диапазон времени начала"
    >
      <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {label}
      </span>

      <div
        style={{
          position: 'relative',
          width: 180,
          height: 28,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Track with gradient fill between thumbs */}
        <div
          style={{
            position: 'absolute',
            left: 0, right: 0, top: '50%',
            transform: 'translateY(-50%)',
            height: 6, borderRadius: 3,
            ...fillStyle,
            pointerEvents: 'none',
          }}
        />

        {/* Two stacked range inputs sharing the same track.
            Each thumb is clickable thanks to pointer-events:auto on ::-webkit-slider-thumb (CSS global). */}
        <input
          type="range"
          min={MIN} max={MAX} step={1}
          value={curFrom}
          onChange={e => setFrom(parseInt(e.target.value, 10))}
          aria-label="С (час)"
          className="gv-time-range-input"
          style={{ position: 'absolute', left: 0, right: 0, width: '100%', zIndex: 3 }}
        />
        <input
          type="range"
          min={MIN} max={MAX} step={1}
          value={curTo}
          onChange={e => setTo(parseInt(e.target.value, 10))}
          aria-label="До (час)"
          className="gv-time-range-input"
          style={{ position: 'absolute', left: 0, right: 0, width: '100%', zIndex: 4 }}
        />
      </div>

      {active && (
        <button
          onClick={reset}
          style={{
            background: 'none', border: 'none',
            color: 'var(--text-muted)', cursor: 'pointer',
            fontSize: '1.1rem', padding: 0, lineHeight: 1,
          }}
          aria-label="Сбросить диапазон времени"
        >×</button>
      )}
    </div>
  );
}
