'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiFetch';

interface MatchingProfile {
  birth_date: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_precision: string | null;
  show_age: boolean;
  is_discoverable_on_events: boolean;
  preferred_categories: string | null;
  preferred_days: string | null;
  preferred_time: string | null;
  budget_max: number | null;
}

const KUDAGO_CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: 'concert', label: 'Концерты', emoji: '🎵' },
  { id: 'theater', label: 'Театр', emoji: '🎭' },
  { id: 'exhibition', label: 'Выставки', emoji: '🎨' },
  { id: 'cinema', label: 'Кино', emoji: '🎬' },
  { id: 'festival', label: 'Фестивали', emoji: '🎪' },
  { id: 'sport', label: 'Спорт', emoji: '⚽' },
  { id: 'lecture', label: 'Лекции', emoji: '📚' },
  { id: 'party', label: 'Вечеринки', emoji: '🎉' },
  { id: 'standup', label: 'Стендап', emoji: '🎤' },
  { id: 'tour', label: 'Экскурсии', emoji: '🗺️' },
];

export default function MatchingProfileSection() {
  const [profile, setProfile] = useState<MatchingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  // Load current profile
  useEffect(() => {
    apiFetch('/users/me')
      .then(async (r) => (r.ok ? ((await r.json()) as MatchingProfile) : null))
      .then((d) => setProfile(d))
      .finally(() => setLoading(false));
  }, []);

  const selectedCategories = new Set(
    (profile?.preferred_categories || '').split(',').map((s) => s.trim()).filter(Boolean)
  );

  const toggleCategory = (id: string) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const curr = new Set(
        (prev.preferred_categories || '').split(',').map((s) => s.trim()).filter(Boolean)
      );
      if (curr.has(id)) curr.delete(id);
      else curr.add(id);
      return { ...prev, preferred_categories: Array.from(curr).join(',') };
    });
  };

  const update = <K extends keyof MatchingProfile>(key: K, value: MatchingProfile[K]) => {
    setProfile((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const requestGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('Геолокация не поддерживается');
      return;
    }
    setGeoStatus('Запрашиваем разрешение…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!profile) return;
        setProfile({
          ...profile,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          geo_precision: 'exact',
        });
        setGeoStatus(`Координаты получены: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
      },
      (err) => setGeoStatus(`Отказано: ${err.message}`),
      { enableHighAccuracy: false, timeout: 10_000 }
    );
  };

  const clearGeo = () => {
    if (!profile) return;
    setProfile({ ...profile, latitude: null, longitude: null, geo_precision: null });
    setGeoStatus('Координаты очищены');
  };

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    setMessage(null);
    const payload: Record<string, unknown> = {
      birth_date: profile.birth_date,
      latitude: profile.latitude,
      longitude: profile.longitude,
      geo_precision: profile.geo_precision,
      show_age: profile.show_age,
      is_discoverable_on_events: profile.is_discoverable_on_events,
      preferred_categories: profile.preferred_categories,
      preferred_days: profile.preferred_days,
      preferred_time: profile.preferred_time,
      budget_max: profile.budget_max,
    };
    // Remove nulls — backend treats null as "don't update"
    for (const k of Object.keys(payload)) {
      if (payload[k] === null || payload[k] === '') delete payload[k];
    }
    const r = await apiFetch('/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    setMessage(r.ok ? 'Сохранено ✓' : `Ошибка ${r.status}`);
    setTimeout(() => setMessage(null), 3000);
  };

  if (loading) {
    return (
      <section
        className="rounded-2xl p-6 mb-4 animate-pulse"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="h-6 w-48 bg-gray-200 rounded mb-4" />
        <div className="h-32 bg-gray-100 rounded" />
      </section>
    );
  }

  if (!profile) return null;

  return (
    <section
      className="rounded-2xl p-6 mb-4"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text)' }}>
        🎯 Профиль матчинга
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        Поможет подобрать события и людей по твоим предпочтениям
      </p>

      {/* Birth date */}
      <div className="mb-5">
        <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
          Дата рождения
        </label>
        <input
          type="date"
          value={profile.birth_date || ''}
          onChange={(e) => update('birth_date', e.target.value || null)}
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <label className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <input
            type="checkbox"
            checked={profile.show_age}
            onChange={(e) => update('show_age', e.target.checked)}
          />
          Показывать мой возраст другим
        </label>
      </div>

      {/* Geolocation */}
      <div className="mb-5">
        <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
          Геолокация
        </label>
        {profile.latitude && profile.longitude ? (
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              📍 {profile.latitude.toFixed(4)}, {profile.longitude.toFixed(4)}
            </span>
            <button
              type="button"
              onClick={clearGeo}
              className="text-xs underline"
              style={{ color: 'var(--primary)' }}
            >
              Очистить
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={requestGeolocation}
            className="px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
          >
            Определить координаты
          </button>
        )}
        {geoStatus && (
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {geoStatus}
          </p>
        )}
      </div>

      {/* Preferred categories */}
      <div className="mb-5">
        <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>
          Любимые категории событий
        </label>
        <div className="flex flex-wrap gap-2">
          {KUDAGO_CATEGORIES.map((c) => {
            const active = selectedCategories.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCategory(c.id)}
                className="px-3 py-1.5 rounded-full text-sm transition"
                style={{
                  background: active ? 'var(--primary)' : 'var(--bg)',
                  color: active ? '#fff' : 'var(--text-muted)',
                  border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                }}
              >
                {c.emoji} {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Time preferences */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
            Предпочитаю дни
          </label>
          <select
            value={profile.preferred_days || 'any'}
            onChange={(e) => update('preferred_days', e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <option value="any">Любые</option>
            <option value="weekends">Выходные</option>
            <option value="weekdays">Будни</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
            Предпочитаю время
          </label>
          <select
            value={profile.preferred_time || 'any'}
            onChange={(e) => update('preferred_time', e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <option value="any">Любое</option>
            <option value="morning">Утро / День</option>
            <option value="evening">Вечер</option>
          </select>
        </div>
      </div>

      {/* Budget */}
      <div className="mb-5">
        <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>
          Максимальная цена события, ₽
        </label>
        <input
          type="number"
          min={0}
          step={100}
          placeholder="Без ограничения"
          value={profile.budget_max ?? ''}
          onChange={(e) => update('budget_max', e.target.value ? Number(e.target.value) : null)}
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
      </div>

      {/* Discoverable flag */}
      <div className="mb-6">
        <label className="flex items-start gap-2" style={{ color: 'var(--text)' }}>
          <input
            type="checkbox"
            checked={profile.is_discoverable_on_events}
            onChange={(e) => update('is_discoverable_on_events', e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="text-sm font-semibold">Показывать меня участникам моих событий</span>
            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
              Другие участники смогут увидеть тебя в блоке «Совместимые участники»
            </span>
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="gv-btn-primary"
        >
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
        {message && (
          <span className="text-sm" style={{ color: message.startsWith('Ошибка') ? '#dc2626' : 'var(--primary)' }}>
            {message}
          </span>
        )}
      </div>
    </section>
  );
}
