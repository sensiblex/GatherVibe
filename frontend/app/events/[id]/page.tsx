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

// KudaGo IDs are large numbers (100000+). Local DB IDs are small (< 10000).
// We detect source by trying local first, then kudago on 404.
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

// ── Unified event shape for the view layer ────────────────────────────────────
interface UnifiedEvent {
  id: string;           // always a string for eventId usage
  source: 'local' | 'kudago';
  title: string;
  description: string | null;
  body_text?: string | null;
  location: string | null;
  city: string | null;
  date_time: string | null;   // ISO for local, null for kudago (uses start_date/time)
  start_date?: string | null; // kudago
  start_time?: string | null; // kudago
  all_dates?: Array<{
    start: string | null;
    end: string | null;
    start_time: string | null;
    end_time: string | null;
    is_continuous: boolean;
    is_endless: boolean;
  }>;
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

// ── Date formatting ───────────────────────────────────────────────────────────
function formatIsoDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatKudagoDate(event: UnifiedEvent): string {
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

// ── Normalise API responses into UnifiedEvent ─────────────────────────────────
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
    all_dates: (data.all_dates as UnifiedEvent['all_dates']) ?? [],
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

// ── Strip HTML tags from KudaGo description ───────────────────────────────────
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
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

// ── Not found ─────────────────────────────────────────────────────────────────
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

// ── UnauthBanner ──────────────────────────────────────────────────────────────
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

// ── Main page ─────────────────────────────────────────────────────────────────
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

    // Step 1: try local DB
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

        // Step 2: local returned 404 → try KudaGo
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

  // Category label: for kudago events we may get an array of slugs
  const categoryLabel = (() => {
    if (!event) return null;
    const first = event.category;
    if (!first) return null;
    return CATEGORY_LABELS[first] ?? first;
  })();

  const displayDate = event ? getDisplayDate(event) : '';

  // KudaGo events: use kudago_id as eventId for attendees/chat/party
  const chatEventId = event?.id ?? eventId;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      <main className="container mx-auto px-4 py-8 max-w-4xl">

        {/* ── Back navigation ── */}
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

        {/* ── States ── */}
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

            {/* ── Event header card ── */}
            <div className="gv-card overflow-hidden" style={{ padding: 0 }}>

              {/* Cover image */}
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

                {/* Category + city + free badges */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {categoryLabel && (
                    <span
                      className="text-xs px-3 py-1 rounded-full font-semibold"
                      style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
                    >
                      {categoryLabel}
                    </span>
                  )}
                  {/* Multiple KudaGo categories */}
                  {event.source === 'kudago' && event.categories && event.categories.slice(1, 4).map(c => (
                    <span
                      key={c}
                      className="text-xs px-3 py-1 rounded-full font-semibold"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                    >
                      {CATEGORY_LABELS[c] ?? c}
                    </span>
                  ))}
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
                      {event.age_restriction}+
                    </span>
                  )}
                </div>

                {/* Title */}
                <h1 className="text-2xl sm:text-3xl font-black mb-4 leading-tight" style={{ color: 'var(--text)' }}>
                  {event.title}
                </h1>

                {/* Meta info row */}
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

                {/* Description */}
                {event.description && (
                  <div
                    className="text-sm leading-relaxed whitespace-pre-line mb-4"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {stripHtml(event.description)}
                  </div>
                )}

                {/* KudaGo body_text (longer description) */}
                {event.source === 'kudago' && event.body_text && event.body_text !== event.description && (
                  <div
                    className="text-sm leading-relaxed mt-2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {stripHtml(event.body_text)}
                  </div>
                )}

                {/* Multiple dates for KudaGo */}
                {event.source === 'kudago' && event.all_dates && event.all_dates.length > 1 && (
                  <div className="mt-6">
                    <p className="text-xs font-semibold uppercase tracking-wide mb-2"
                      style={{ color: 'var(--text-faint)' }}
                    >
                      Все даты
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {event.all_dates.slice(0, 8).map((d, i) => (
                        d.start && (
                          <span
                            key={i}
                            className="text-xs px-3 py-1 rounded-full"
                            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                          >
                            {d.start} {d.start_time ? `в ${d.start_time}` : ''}
                          </span>
                        )
                      ))}
                      {event.all_dates.length > 8 && (
                        <span className="text-xs px-3 py-1 rounded-full"
                          style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                        >
                          +{event.all_dates.length - 8} ещё
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Participants (KudaGo) */}
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

            {/* ── KudaGo source badge ── */}
            {event.source === 'kudago' && (
              <p className="text-xs text-center" style={{ color: 'var(--text-faint)' }}>
                Данные предоставлены{' '}
                <a href="https://kudago.com" target="_blank" rel="noopener noreferrer"
                  className="underline hover:opacity-70 transition"
                  style={{ color: 'var(--text-muted)' }}
                >
                  KudaGo
                </a>
              </p>
            )}

            {/* ── Unauth CTA ── */}
            {!user && <UnauthBanner />}

            {/* ── Interactive blocks (attendees, party, chat) ── */}
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
