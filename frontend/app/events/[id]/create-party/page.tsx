'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../../../components/Navbar';
import { useAuth } from '../../../context/AuthContext';
import { apiFetch } from '../../../lib/apiFetch';
import { buildPermanentDateOptions, type ScheduleEntry } from './date-options';
import { extractSchedulesFromAllDates } from '../../utils';

const MAX_EVENT_DATE_FUTURE_DAYS = 180;

function toDateTimeLocalValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${mm}`;
}

function parseErrorDetail(detail: unknown): string {
  if (!detail) return 'Ошибка создания';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        if (typeof e === 'object' && e !== null) {
          const loc = (e as Record<string, unknown>).loc;
          const msg = (e as Record<string, unknown>).msg;
          const locStr = Array.isArray(loc) ? loc.join(' -> ') : '';
          return locStr ? `${locStr}: ${msg}` : String(msg ?? JSON.stringify(e));
        }
        return String(e);
      })
      .join('; ');
  }
  return JSON.stringify(detail);
}

export default function CreatePartyPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.id as string;
  const { token, isLoading } = useAuth();

  const [form, setForm] = useState({ title: '', description: '', max_members: 4 });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEventDateTs, setSelectedEventDateTs] = useState<number | null>(null);
  const [isPermanentEvent, setIsPermanentEvent] = useState(false);
  const [dateOptions, setDateOptions] = useState<Array<{ value: number; label: string }>>([]);
  const [manualDateTime, setManualDateTime] = useState('');

  useEffect(() => {
    if (!isLoading && token === null) {
      router.replace('/login');
    }
  }, [isLoading, token, router]);

  useEffect(() => {
    let cancelled = false;
    const loadEvent = async () => {
      if (!eventId) return;
      try {
        const res = await apiFetch(`/events/${eventId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const isPermanent = Boolean(data?.is_permanent);
        setIsPermanentEvent(isPermanent);
        if (!isPermanent) return;
        const schedules: ScheduleEntry[] = extractSchedulesFromAllDates(data?.all_dates ?? []);
        const options = buildPermanentDateOptions(schedules);
        setDateOptions(options);
        setSelectedEventDateTs(options[0]?.value ?? null);
        if (options.length > 0) setManualDateTime('');
      } catch {
        if (!cancelled) {
          setDateOptions([]);
          setSelectedEventDateTs(null);
        }
      }
    };
    void loadEvent();
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const handleCreate = async () => {
    if (!token) return;
    if (!form.title.trim()) {
      setError('Название обязательно');
      return;
    }
    const manualDateTs = manualDateTime ? Math.floor(new Date(manualDateTime).getTime() / 1000) : null;
    const eventDateTsPayload = dateOptions.length > 0 ? selectedEventDateTs : manualDateTs;
    if (isPermanentEvent && !eventDateTsPayload) {
      setError('Укажите дату и время встречи');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await apiFetch(`/parties/event/${eventId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          max_members: form.max_members,
          event_date_ts: eventDateTsPayload,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(parseErrorDetail(data.detail));
        setCreating(false);
        return;
      }
      router.push(`/events/${eventId}`);
    } catch {
      setError('Ошибка сети');
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <main className="container mx-auto px-4 py-10 max-w-lg">
        <nav className="flex items-center gap-2 text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          <Link href="/events" className="transition hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
            События
          </Link>
          <span>/</span>
          <Link href={`/events/${eventId}`} className="transition hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
            Мероприятие
          </Link>
          <span>/</span>
          <span style={{ color: 'var(--text)' }}>Создать компанию</span>
        </nav>

        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="px-8 py-6 bg-gradient-to-r from-purple-600 to-pink-600">
            <div className="flex items-center gap-3">
              <span className="text-4xl">🎉</span>
              <div>
                <h1 className="text-xl font-black text-white">Создать компанию</h1>
                <p className="text-purple-200 text-sm mt-0.5">Найди единомышленников для похода</p>
              </div>
            </div>
          </div>

          <div className="px-8 py-6 flex flex-col gap-5">
            {error && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: 'var(--error-hl)',
                  border: '1px solid color-mix(in oklch, var(--error) 30%, transparent)',
                  color: 'var(--error)',
                }}
              >
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Название компании *
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value.slice(0, 60) }))}
                placeholder="Например: Приятная компания на вечер"
                className="gv-input"
              />
              <span className="text-xs text-right" style={{ color: 'var(--text-faint)' }}>
                {form.title.length}/60
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Описание
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value.slice(0, 300) }))}
                placeholder="Кого ищешь, планы на вечер, пожелания..."
                rows={4}
                className="gv-input resize-none"
              />
              <span className="text-xs text-right" style={{ color: 'var(--text-faint)' }}>
                {form.description.length}/300
              </span>
            </div>

            {isPermanentEvent && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                  Дата встречи *
                </label>
                {dateOptions.length > 0 ? (
                  <select
                    value={selectedEventDateTs ?? ''}
                    onChange={(e) => setSelectedEventDateTs(Number(e.target.value) || null)}
                    className="gv-input"
                  >
                    {dateOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <>
                    <div className="text-sm" style={{ color: 'var(--text-faint)' }}>
                      Не удалось построить даты по расписанию. Укажите дату и время вручную.
                    </div>
                    <input
                      type="datetime-local"
                      value={manualDateTime}
                      onChange={(e) => setManualDateTime(e.target.value)}
                      min={toDateTimeLocalValue(new Date())}
                      max={toDateTimeLocalValue(new Date(Date.now() + MAX_EVENT_DATE_FUTURE_DAYS * 24 * 3600 * 1000))}
                      className="gv-input"
                    />
                  </>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Макс. количество участников
              </label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, max_members: Math.max(2, f.max_members - 1) }))}
                  className="w-10 h-10 rounded-full font-bold text-lg transition hover:opacity-80"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}
                >
                  −
                </button>
                <span className="text-2xl font-black w-8 text-center" style={{ color: 'var(--text)' }}>
                  {form.max_members}
                </span>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, max_members: Math.min(20, f.max_members + 1) }))}
                  className="w-10 h-10 rounded-full font-bold text-lg transition hover:opacity-80"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}
                >
                  +
                </button>
                <span className="text-sm" style={{ color: 'var(--text-faint)' }}>человек (включая вас)</span>
              </div>
            </div>
          </div>

          <div className="px-8 pb-8 flex gap-3">
            <button
              onClick={handleCreate}
              disabled={
                creating
                || !form.title.trim()
                || (isPermanentEvent && dateOptions.length > 0 && !selectedEventDateTs)
                || (isPermanentEvent && dateOptions.length === 0 && !manualDateTime)
              }
              className="flex-1 text-white font-bold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-60 bg-gradient-to-r from-purple-600 to-pink-600"
              style={{ boxShadow: 'var(--shadow-md)' }}
            >
              {creating ? 'Создание...' : '🎉 Создать компанию'}
            </button>
            <Link
              href={`/events/${eventId}`}
              className="px-5 py-3 rounded-xl text-sm font-medium transition hover:opacity-80"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}
            >
              Отмена
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
