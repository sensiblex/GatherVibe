'use client';

import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { useRecommendedEvents } from '../hooks/useRecommendedEvents';
import RecommendedEventCard from './RecommendedEventCard';

export default function RecommendedEventsSection() {
  const { user, isLoading: authLoading } = useAuth();
  const { events, loading, dismissEvent, likeEvent } = useRecommendedEvents(12);

  if (authLoading || !user) return null;

  return (
    <section className="py-16" style={{ background: 'var(--bg)' }}>
      <div className="container mx-auto px-4">
        <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-3xl md:text-4xl font-black mb-2" style={{ color: 'var(--text)' }}>
              События для тебя
            </h2>
            <p className="text-base" style={{ color: 'var(--text-muted)' }}>
              Подобрано по интересам, истории и локации
            </p>
          </div>
          {events.length > 0 && (
            <Link
              href="/events"
              className="text-sm font-semibold hover:opacity-70 transition"
              style={{ color: 'var(--primary)' }}
            >
              Все события →
            </Link>
          )}
        </div>

        {loading ? (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex-shrink-0 w-[320px] h-72 rounded-2xl animate-pulse"
                style={{ background: 'var(--surface-2)' }}
              />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div
            className="p-6 text-center rounded-2xl"
            style={{
              background: 'var(--surface)',
              border: '1px dashed var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            Пока нет подходящих событий. Заполни интересы в профиле или загляни позже 🎉
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto md:grid md:grid-cols-3 lg:grid-cols-4 md:overflow-visible pb-2">
            {events.map((e) => (
              <RecommendedEventCard
                key={e.event_id}
                event={e}
                onDismiss={dismissEvent}
                onLike={likeEvent}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
