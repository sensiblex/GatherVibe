'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../../../app/components/Navbar';
import EventAttendees from '../../../app/components/EventAttendees';
import EventChat from '../../../app/components/EventChat';
import EventParty from '../../../app/components/EventParty';
import { apiFetch } from '../../lib/apiFetch';
import { useAuth } from '../../context/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const CATEGORY_LABELS: Record<string, string> = {
  concert: '🎵 Концерт',
  theater: '🎭 Театр',
  exhibition: '🎨 Выставка',
  festival: '🎪 Фестиваль',
  sport: '⚽ Спорт',
  standup: '🎤 Стендап',
  cinema: '🎬 Кино',
  lecture: '📚 Лекция',
  tour: '🗺️ Экскурсия',
  party: '🎉 Вечеринка',
  master_class: '🎓 Мастер-класс',
};

const WEEKDAY_SHORT: Record<number, string> = {
  1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 0: 'Вс',
};

interface ScheduleEntry {
  weekday: number;
  from: string;
  to: string;
}

interface UnifiedEvent {
  id: string;
  source: 'local' | 'kudago';
  title: string;
  description: string | null;
  body_text?: string | null;
  location: string | null;
  city: string | null;
  date_time: string | null;
  start_date?: string | null;
  start_time?: string | null;
  all_dates?: Array<{
    start: string | null;
    end: string | null;
    start_time: string | null;
    end_time: string | null;
    is_continuous: boolean;
    is_endless: boolean;
    is_startless?: boolean;
    use_place_schedule?: boolean;
  }>;
  is_permanent?: boolean;
  place_schedules?: ScheduleEntry[];
  category: string | null;
  categories?: string[];
  image_url: string | null;
  is_free?: boolean;
  price?: string;
  age_restriction?: string | null;
  place_title?: string;
  place_address?: string;
  place_phone?: string;
  place_subway?: string;
  site_url?: string;
  participants?: Array<{ role: string; name: string; image_url: string | null }>;
}

function formatIsoDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatKudagoDate(event: UnifiedEvent): string {
  if (event.is_permanent) return 'Постоянная экспозиция';
  if (event.start_date) {
    const d = event.start_date;
    const t = event.start_time ? ` в ${event.start_time}` : '';
    const [y, m, day] = d.split('-').map(Number);
    const months = ['', 'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `${day} ${months[m] ?? ''} ${y}${t}`;
  }
  return 'Дата уточняется';
}

function getDisplayDate(event: UnifiedEvent): string {
  if (event.source === 'local' && event.date_time) return formatIsoDate(event.date_time);
  return formatKudagoDate(event);
}

function getFilteredDates(allDates: UnifiedEvent['all_dates']): UnifiedEvent['all_dates'] {
  if (!allDates || allDates.length === 0) return [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDate = now.getDate();
  const maxFutureDate = new Date(currentYear + 1, currentMonth, currentDate);
  const seen = new Set<string>();
  const filtered: typeof allDates = [];
  for (const d of allDates) {
    if (!d.start) continue;
    const dateYear = parseInt(d.start.split('-')[0], 10);
    if (isNaN(dateYear) || dateYear < 2020 || dateYear > currentYear + 5) continue;
    const eventDate = new Date(d.start);
    if (eventDate < now) continue;
    if (eventDate > maxFutureDate) continue;
    const key = `${d.start}-${d.start_time || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    filtered.push(d);
  }
  filtered.sort((a, b) => {
    if (!a.start || !b.start) return 0;
    return new Date(a.start).getTime() - new Date(b.start).getTime();
  });
  return filtered;
}

function normaliseLocal(data: Record<string, unknown>): UnifiedEvent {
  return {
    id: String(data.id),
    source: 'local',
    title: String(data.title ?? ''),
    description: (data.description as string) ?? null,
    location: (data.location as string) ?? null,
    city: (data.city as string) ?? null,
    date_time: (data.date_time as string) ?? null,
    category: (data.category as string) ?? null,
    image_url: (data.image_url as string) ?? null,
  };
}

function normaliseKudago(data: Record<string, unknown>): UnifiedEvent {
  const imgs = (data.images as Array<{ url: string }>) ?? [];
  const cats = (data.categories as string[]) ?? [];
  const allDates = (data.all_dates as UnifiedEvent['all_dates']) ?? [];
  const isPermanent = Boolean(data.is_permanent) ||
    allDates.some(d => d.is_endless || d.is_startless || d.use_place_schedule);
  const placeSchedules: ScheduleEntry[] = [];

  return {
    id: String(data.kudago_id ?? data.id ?? ''),
    source: 'kudago',
    title: String(data.title ?? ''),
    description: (data.description as string) || null,
    body_text: (data.body_text as string) || null,
    location: (data.place_address as string) || null,
    city: null,
    date_time: null,
    start_date: (data.start_date as string) ?? null,
    start_time: (data.start_time as string) ?? null,
    all_dates: allDates,
    is_permanent: isPermanent,
    place_schedules: placeSchedules,
    category: cats[0] ?? null,
    categories: cats,
    image_url: imgs[0]?.url ?? (data.cover_url as string) ?? null,
    is_free: Boolean(data.is_free),
    price: (data.price as string) || '',
    age_restriction: (data.age_restriction as string) ?? null,
    place_title: (data.place_title as string) || '',
    place_address: (data.place_address as string) || '',
    place_phone: (data.place_phone as string) || '',
    place_subway: (data.place_subway as string) || '',
    site_url: (data.site_url as string) || '',
    participants: (data.participants as UnifiedEvent['participants']) ?? [],
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function PermanentSchedule({ schedules }: { schedules?: ScheduleEntry[] }) {
  const hasSchedule = schedules && schedules.length > 0;

  function groupSchedule(entries: ScheduleEntry[]): { label: string; time: string }[] {
    const sorted = [...entries].sort((a, b) => a.weekday - b.weekday);
    const groups: { days: number[]; from: string; to: string }[] = [];
    for (const e of sorted) {
      const last = groups[groups.length - 1];
      if (last && last.from === e.from && last.to === e.to) {
        last.days.push(e.weekday);
      } else {
        groups.push({ days: [e.weekday], from: e.from, to: e.to });
      }
    }
    return groups.map(g => ({
      label: g.days.map(d => WEEKDAY_SHORT[d]).join(', '),
      time: `${g.from}–${g.to}`,
    }));
  }

  return (
    <div
      className="mt-6 rounded-2xl p-5"
      style={{
        background: 'linear-gradient(135deg, color-mix(in oklch, var(--primary) 8%, var(--surface)), var(--surface))',
        border: '1px solid color-mix(in oklch, var(--primary) 20%, var(--border))',
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🔁</span>
        <div>
          <p className="font-bold text-sm" style={{ color: 'var(--text)' }}>Постоянное событие</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Работает круглый год по расписанию</p>
        </div>
      </div>

      {hasSchedule ? (
        <div className="space-y-2">
          {groupSchedule(schedules!).map((row, i) => (
            <div key={i} className="flex justify-between items-center">
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{row.label}</span>
              <span
                className="text-sm font-semibold px-3 py-0.5 rounded-full"
                style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
              >
                {row.time}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Точное расписание уточняйте на сайте места проведения.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <span
              className="text-xs px-3 py-1 rounded-full font-semibold"
              style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
            >
              📅 Круглый год
            </span>
            <span
              className="text-xs px-3 py-1 rounded-full font-semibold"
              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              🔁 Повторяется регулярно
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function EventSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-64 rounded-3xl" style={{ background: 'var(--surface-2)' }} />
      <div className="space-y-3">
        <div className="h-8 w-2/3 rounded-xl" style={{ background: 'var(--surface-2)' }} />
        <div className="h-4 w-1/3 rounded-xl" style={{ background: 'var(--surface-2)' }} />
        <div className="h-4 w-full rounded-xl" style={{ background: 'var(--surface-2)' }} />
        <div className="h-4 w-5/6 rounded-xl" style={{ background: 'var(--surface-2)' }} />
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="text-center py-24 px-4">
      <p className="text-6xl mb-4">🔍</p>
      <h2 className="text-2xl font-black mb-2" style={{ color: 'var(--text)' }}>
        Событие не найдено
      </h2>
      <p className="mb-8" style={{ color: 'var(--text-muted)' }}>
        Оно могло быть удалено или ссылка неверна
      </p>
      <Link href="/events" className="gv-btn-primary px-6 py-3">
        ← К списку событий
      </Link>
    </div>
  );
}

function UnauthBanner() {
  return (
    <div
      className="rounded-2xl px-6 py-5 flex flex-col sm:flex-row items-center gap-4"
      style={{
        background: 'linear-gradient(135deg, var(--primary-hl), color-mix(in oklch, var(--primary) 8%, var(--surface)))',
        border: '1px solid color-mix(in oklch, var(--primary) 25%, var(--border))',
      }}
    >
      <div className="text-3xl">🔐</div>
      <div className="flex-1 text-center sm:text-left">
        <p className="font-bold" style={{ color: 'var(--text)' }}>Войдите, чтобы участвовать</p>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Присоединяйтесь к событиям, создавайте компании и общайтесь в чате
        </p>
      </div>
      <div className="flex gap-3 shrink-0">
        <Link href="/login" className="gv-btn-primary px-5 py-2 text-sm">Войти</Link>
        <Link
          href="/register"
          className="px-5 py-2 text-sm rounded-xl font-semibold transition hover:opacity-80"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
        >
          Регистрация
        </Link>
      </div>
    </div>
  );
}

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const eventId = String(params?.id ?? '');

  const [event, setEvent] = useState<UnifiedEvent | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');

  useEffect(() => {
    if (!eventId) return;
    setStatus('loading');

    apiFetch(`${API_BASE}/events/${eventId}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setEvent(normaliseLocal(data));
          setStatus('ok');
          return;
        }
        if (res.status !== 404) {
          setStatus('error');
          return;
        }
        const kg = await apiFetch(`${API_BASE}/kudago/events/${eventId}`);
        if (kg.ok) {
          const data = await kg.json();
          setEvent(normaliseKudago(data));
          setStatus('ok');
        } else if (kg.status === 404) {
          setStatus('notfound');
        } else {
          setStatus('error');
        }
      })
      .catch(() => setStatus('error'));
  }, [eventId]);

  const categoryLabel = (() => {
    if (!event) return null;
    const first = event.category;
    if (!first) return null;
    return CATEGORY_LABELS[first] ?? first;
  })();

  const displayDate = event ? getDisplayDate(event) : '';
  const chatEventId = event?.id ?? eventId;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      <main className="container mx-auto px-4 py-8 max-w-4xl">

        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm font-semibold mb-6 transition hover:opacity-70"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Назад
        </button>

        {status === 'loading' && <EventSkeleton />}
        {status === 'notfound' && <NotFound />}
        {status === 'error' && (
          <div className="text-center py-24">
            <p className="text-5xl mb-4">⚠️</p>
            <h2 className="text-xl font-black mb-2" style={{ color: 'var(--text)' }}>Ошибка загрузки</h2>
            <p className="mb-6" style={{ color: 'var(--text-muted)' }}>Не удалось получить данные события</p>
            <button onClick={() => window.location.reload()} className="gv-btn-primary px-6 py-3">
              Попробовать снова
            </button>
          </div>
        )}

        {status === 'ok' && event && (
          <div className="space-y-8">

            <div className="gv-card overflow-hidden" style={{ padding: 0 }}>

              {event.image_url && (
                <div className="w-full h-56 sm:h-72 overflow-hidden">
                  <img
                    src={event.image_url}
                    alt={event.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}

              <div className="p-6 sm:p-8">

                {/* Badges */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {categoryLabel && (
                    <span
                      className="text-xs px-3 py-1 rounded-full font-semibold"
                      style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
                    >
                      {categoryLabel}
                    </span>
                  )}
                  {event.source === 'kudago' && event.categories && event.categories.slice(1, 4).map(c => (
                    <span
                      key={c}
                      className="text-xs px-3 py-1 rounded-full font-semibold"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                    >
                      {CATEGORY_LABELS[c] ?? c}
                    </span>
                  ))}
                  {event.is_permanent && (
                    <span className="text-xs px-3 py-1 rounded-full font-semibold bg-violet-100 text-violet-700">
                      🔁 Круглый год
                    </span>
                  )}
                  {event.city && (
                    <span
                      className="text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                    >
                      📍 {event.city}
                    </span>
                  )}
                  {event.source === 'kudago' && event.is_free && (
                    <span className="text-xs px-3 py-1 rounded-full font-semibold bg-emerald-100 text-emerald-700">
                      🆓 Бесплатно
                    </span>
                  )}
                  {event.source === 'kudago' && !event.is_free && event.price && (
                    <span
                      className="text-xs px-3 py-1 rounded-full font-semibold"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                    >
                      💰 {event.price}
                    </span>
                  )}
                  {event.source === 'kudago' && event.age_restriction && (
                    <span
                      className="text-xs px-3 py-1 rounded-full font-semibold"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                    >
                      {event.age_restriction && typeof event.age_restriction === 'string' && event.age_restriction.endsWith('+') ? event.age_restriction : `${event.age_restriction}+`}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h1 className="text-2xl sm:text-3xl font-black mb-4 leading-tight" style={{ color: 'var(--text)' }}>
                  {event.title}
                </h1>

                {/* Meta row */}
                <div className="flex flex-wrap gap-4 mb-6">
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span>{displayDate}</span>
                  </div>

                  {(event.place_address || event.location) && (
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <span>{event.place_title ? `${event.place_title} — ` : ''}{event.place_address || event.location}</span>
                    </div>
                  )}

                  {event.place_subway && (
                    <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <span>🚇</span>
                      <span>{event.place_subway}</span>
                    </div>
                  )}

                  {event.site_url && (
                    <a
                      href={event.site_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-sm font-medium transition hover:opacity-70"
                      style={{ color: 'var(--primary)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      Сайт события
                    </a>
                  )}
                </div>

                {/* Descriptions */}
                {event.description && (
                  <div
                    className="text-sm leading-relaxed whitespace-pre-line mb-4"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {stripHtml(event.description)}
                  </div>
                )}
                {event.source === 'kudago' && event.body_text && event.body_text !== event.description && (
                  <div
                    className="text-sm leading-relaxed mt-2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {stripHtml(event.body_text)}
                  </div>
                )}

                {/* Блок расписания для постоянных событий */}
                {event.source === 'kudago' && event.is_permanent && (
                  <PermanentSchedule schedules={event.place_schedules} />
                )}

                {/* Разовые даты (только если НЕ постоянное событие) */}
                {event.source === 'kudago' && !event.is_permanent && event.all_dates && (() => {
                  const filteredDates = getFilteredDates(event.all_dates);
                  return filteredDates.length > 1 ? (
                    <div className="mt-6">
                      <p className="text-xs font-semibold uppercase tracking-wide mb-2"
                        style={{ color: 'var(--text-faint)' }}
                      >
                        Все даты
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {filteredDates.slice(0, 8).map((d, i) => (
                          d.start && (
                            <span
                              key={`${d.start}-${d.start_time}-${i}`}
                              className="text-xs px-3 py-1 rounded-full"
                              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                            >
                              {d.start} {d.start_time ? `в ${d.start_time}` : ''}
                            </span>
                          )
                        ))}
                        {filteredDates.length > 8 && (
                          <span className="text-xs px-3 py-1 rounded-full"
                            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                          >
                            +{filteredDates.length - 8} ещё
                          </span>
                        )}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Participants */}
                {event.source === 'kudago' && event.participants && event.participants.length > 0 && (
                  <div className="mt-6">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-3"
                      style={{ color: 'var(--text-faint)' }}
                    >
                      Участники
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {event.participants.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          {p.image_url && (
                            <img
                              src={p.image_url}
                              alt={p.name}
                              width={32}
                              height={32}
                              loading="lazy"
                              className="w-8 h-8 rounded-full object-cover"
                            />
                          )}
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{p.name}</p>
                            {p.role && (
                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.role}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>

            {!user && <UnauthBanner />}

            <EventAttendees eventId={chatEventId} />
            <EventParty eventId={chatEventId} />
            <EventChat
              eventId={chatEventId}
              currentUserId={user ? String(user.id) : ''}
              currentUsername={user?.username ?? 'Аноним'}
            />

          </div>
        )}
      </main>
    </div>
  );
}
