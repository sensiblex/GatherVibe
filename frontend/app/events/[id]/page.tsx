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

interface EventDetail {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  city: string | null;
  date_time: string;
  category: string | null;
  image_url: string | null;
  is_active: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
      <Link
        href="/events"
        className="gv-btn-primary px-6 py-3"
      >
        ← К списку событий
      </Link>
    </div>
  );
}

// ── Unauthorized CTA banner ───────────────────────────────────────────────────
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
        <p className="font-bold" style={{ color: 'var(--text)' }}>
          Войдите, чтобы участвовать
        </p>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Присоединяйтесь к событиям, создавайте компании и общайтесь в чате
        </p>
      </div>
      <div className="flex gap-3 shrink-0">
        <Link
          href="/login"
          className="gv-btn-primary px-5 py-2 text-sm"
        >
          Войти
        </Link>
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

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');

  useEffect(() => {
    if (!eventId) return;
    setStatus('loading');
    apiFetch(`${API_BASE}/events/${eventId}`)
      .then(async (res) => {
        if (res.status === 404) { setStatus('notfound'); return; }
        if (!res.ok) { setStatus('error'); return; }
        const data: EventDetail = await res.json();
        setEvent(data);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [eventId]);

  const categoryLabel = event?.category
    ? (CATEGORY_LABELS[event.category] ?? event.category)
    : null;

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
            <button
              onClick={() => window.location.reload()}
              className="gv-btn-primary px-6 py-3"
            >
              Попробовать снова
            </button>
          </div>
        )}

        {status === 'ok' && event && (
          <div className="space-y-8">

            {/* ── Event header card ── */}
            <div
              className="gv-card overflow-hidden"
              style={{ padding: 0 }}
            >
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
                {/* Category + city badges */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {categoryLabel && (
                    <span
                      className="text-xs px-3 py-1 rounded-full font-semibold"
                      style={{
                        background: 'var(--primary-hl)',
                        color: 'var(--primary)',
                      }}
                    >
                      {categoryLabel}
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
                </div>

                {/* Title */}
                <h1 className="text-2xl sm:text-3xl font-black mb-4 leading-tight" style={{ color: 'var(--text)' }}>
                  {event.title}
                </h1>

                {/* Meta info */}
                <div className="flex flex-wrap gap-4 mb-6">
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span>{formatDate(event.date_time)}</span>
                  </div>
                  {event.location && (
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <span>{event.location}</span>
                    </div>
                  )}
                </div>

                {/* Description */}
                {event.description && (
                  <div
                    className="text-sm leading-relaxed whitespace-pre-line"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {event.description}
                  </div>
                )}
              </div>
            </div>

            {/* ── Unauth CTA (shown only when logged out) ── */}
            {!user && <UnauthBanner />}

            {/* ── Interactive blocks ── */}
            <EventAttendees eventId={eventId} />

            <EventParty eventId={eventId} />

            <EventChat
              eventId={eventId}
              currentUserId={user ? String(user.id) : ''}
              currentUsername={user?.username ?? 'Аноним'}
            />

          </div>
        )}
      </main>
    </div>
  );
}
