'use client';

import { useState } from 'react';
import type { GeoPoint } from './event-filters';

interface Props {
  value: GeoPoint | null;
  onChange: (v: GeoPoint | null) => void;
}

const DEFAULT_RADIUS_M = 5000;

export default function GeoFilter({ value, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const active = value !== null;

  const locate = () => {
    if (!navigator.geolocation) {
      setErr('Геолокация недоступна');
      return;
    }
    setBusy(true); setErr(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setBusy(false);
        onChange({ lat: coords.latitude, lon: coords.longitude, radiusM: value?.radiusM ?? DEFAULT_RADIUS_M });
      },
      (e) => { setBusy(false); setErr(e.message || 'Ошибка геолокации'); },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  const clear = () => { setErr(null); onChange(null); };

  const changeRadius = (r: number) => {
    if (!value) return;
    onChange({ ...value, radiusM: r });
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      {!active ? (
        <button
          onClick={locate}
          disabled={busy}
          className="btn btn-ghost btn-sm"
          aria-label="Показать события рядом"
        >
          {busy ? 'Определяю…' : 'Рядом со мной'}
        </button>
      ) : (
        <>
          <span className="badge badge-ink" style={{ gap: 6 }}>
            {(value!.radiusM / 1000).toFixed(1)} км
            <button
              onClick={clear}
              style={{ marginLeft: 4, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}
              aria-label="Сбросить геофильтр"
            >×</button>
          </span>
          <input
            type="range" min={1000} max={20000} step={1000}
            value={value!.radiusM}
            onChange={e => changeRadius(parseInt(e.target.value, 10))}
            aria-label="Радиус поиска"
            style={{ width: 120 }}
          />
        </>
      )}
      {err && <span className="t-xs" style={{ color: 'var(--error)' }}>{err}</span>}
    </div>
  );
}
