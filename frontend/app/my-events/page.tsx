'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../lib/apiFetch';
import Navbar from '../components/Navbar';
import ReviewModal, { ReviewableUser } from '../components/ReviewModal';
import { ToastContainer } from '../components/Toast';
import { translateCategory } from '../events/utils';
import { capitalizeFirstDisplayChar } from '../lib/text';
import { resolveApiBase } from '../lib/apiBase';

const API_BASE = resolveApiBase();

interface MyEventItem {
  event_id: string;
  title: string;
  date_ts: number | null;
  city: string | null;
  category: string | null;
  image_url: string | null;
  location: string | null;
  is_looking: boolean;
  comment: string | null;
}

interface MyEventsResponse {
  upcoming: MyEventItem[];
  past: MyEventItem[];
}

export default function MyEventsPage() {
  const router = useRouter();
  const [data, setData]       = useState<MyEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  // Reviewable users grouped by event_id
  const [reviewableByEvent, setReviewableByEvent] = useState<Record<string, ReviewableUser[]>>({});
  // event_id whose review modal is open
  const [reviewingEventId, setReviewingEventId] = useState<string | null>(null);

  useEffect(() => {
    // middleware редиректит аноним на /login, здесь пробуем запрос —
    // 401 от apiFetch сам сделает редирект.
    Promise.all([
      apiFetch(`${API_BASE}/users/me/events`).then(r => {
        if (!r.ok) throw new Error(`Не удалось загрузить события: ${r.status}`);
        return r.json();
      }),
      apiFetch(`${API_BASE}/users/me/reviewable`)
        .then(r => (r.ok ? r.json() : [] as ReviewableUser[]))
        .catch(() => [] as ReviewableUser[]),
    ]).then(([eventsData, reviewable]: [MyEventsResponse, ReviewableUser[]]) => {
      setData(eventsData);

      // Group reviewable users by party_id, then map to event_id via past events
      // We don't have event_id in ReviewableUser, so we group by party_id and store under
      // a synthetic key. We'll match past events by checking if any reviewable exists.
      // Group reviewable users by event_id
      const grouped: Record<string, ReviewableUser[]> = {};
      for (const u of reviewable) {
        const key = u.event_id;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(u);
      }
      setReviewableByEvent(grouped);
    }).catch(() => setData({ upcoming: [], past: [] })).finally(() => setLoading(false));
  }, [router]);

  function clearReviewableForEvent(eventId: string) {
    setReviewableByEvent(prev => {
      if (!prev[eventId]) return prev;
      const next = { ...prev };
      delete next[eventId];
      return next;
    });
  }

  const list = activeTab === 'upcoming' ? (data?.upcoming ?? []) : (data?.past ?? []);

  function getReviewableForEvent(eventId: string): ReviewableUser[] {
    return reviewableByEvent[eventId] ?? [];
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <ToastContainer />

      <main className="container mx-auto px-4 py-10 max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black" style={{ color: 'var(--text)' }}>Мои события</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Все мероприятия, на которые вы зарегистрировались
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['upcoming', 'past'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition"
              style={{
                background: activeTab === t ? 'var(--primary)' : 'var(--surface)',
                color: activeTab === t ? 'var(--text-inverse)' : 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}>
              {t === 'upcoming' ? 'Предстоящие' : 'Прошедшие'}
              {data && (
                <span className="ml-1.5 opacity-70">
                  ({t === 'upcoming' ? data.upcoming.length : data.past.length})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-3xl p-4 flex gap-4"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="w-20 h-20 rounded-2xl shrink-0" style={{ background: 'var(--surface-2)' }} />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 rounded w-2/3" style={{ background: 'var(--surface-2)' }} />
                  <div className="h-3 rounded w-1/2" style={{ background: 'var(--surface-2)' }} />
                  <div className="h-3 rounded w-1/4" style={{ background: 'var(--surface-2)' }} />
                </div>
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <div
            className="rounded-3xl p-12 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-5xl mb-4">{activeTab === 'upcoming' ? '📅' : '🕰'}</p>
            <p className="text-lg font-bold mb-1" style={{ color: 'var(--text)' }}>
              {activeTab === 'upcoming' ? 'Нет предстоящих событий' : 'Нет прошедших событий'}
            </p>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              {activeTab === 'upcoming'
                ? 'Зарегистрируйтесь на ближайшие мероприятия'
                : 'Здесь появятся события, которые вы уже посетили'}
            </p>
            <Link
              href="/events"
              className="inline-block px-6 py-2.5 rounded-xl font-bold text-sm text-white"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
            >
              Найти события →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {list.map(ev => {
              const isPast = activeTab === 'past';
              const reviewable = isPast ? getReviewableForEvent(ev.event_id) : [];
              const hasUnreviewed = reviewable.length > 0;
              const displayTitle = capitalizeFirstDisplayChar(ev.title);

              return (
                <div
                  key={ev.event_id}
                  className="rounded-3xl p-4"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
                >
                  <Link
                    href={`/events/${ev.event_id}`}
                    className="flex gap-4 hover:opacity-80 transition-opacity"
                  >
                    {ev.image_url ? (
                      <img src={ev.image_url} alt={displayTitle}
                        className="w-20 h-20 rounded-2xl object-cover shrink-0" />
                    ) : (
                      <div className="w-20 h-20 rounded-2xl shrink-0 flex items-center justify-center text-3xl"
                        style={{ background: 'var(--surface-2)' }}>🎭</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-base line-clamp-1" style={{ color: 'var(--text)' }}>
                        {displayTitle}
                      </p>
                      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                        {ev.date_ts
                          ? new Date(ev.date_ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
                          : 'Дата не указана'}
                      </p>
                      {(ev.city || ev.location) && (
                        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {ev.city ?? ev.location}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {ev.category && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                            style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}>
                            {translateCategory(ev.category)}
                          </span>
                        )}
                        {ev.is_looking && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium"
                            style={{ background: 'var(--success-hl)', color: 'var(--success)' }}>
                            Ищу компанию
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>

                  {isPast && hasUnreviewed && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                      <button
                        onClick={() => setReviewingEventId(ev.event_id)}
                        className="w-full py-2 rounded-xl text-sm font-semibold transition hover:opacity-90"
                        style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff' }}
                      >
                        Оценить участников ({reviewable.length})
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {reviewingEventId && getReviewableForEvent(reviewingEventId).length > 0 && (
        <ReviewModal
          users={getReviewableForEvent(reviewingEventId)}
          onClose={() => setReviewingEventId(null)}
          onAllReviewed={() => {
            const completedEventId = reviewingEventId;
            setReviewingEventId(null);
            if (completedEventId) clearReviewableForEvent(completedEventId);
          }}
        />
      )}
    </div>
  );
}

