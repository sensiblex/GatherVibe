'use client';

import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import EventCard, { KudaGoEvent } from '../components/EventCard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const PAGE_SIZE = 12;

export default function EventsPage() {
  const [events, setEvents] = useState<KudaGoEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState<number | null>(null);

  const fetchEvents = async (pageNum: number, append = false) => {
    try {
      append ? setLoadingMore(true) : setLoading(true);
      setError(null);
      const res = await fetch(
        `${API_BASE}/kudago/events?location=kzn&page=${pageNum}&page_size=${PAGE_SIZE}`
      );
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data = await res.json();
      const newEvents: KudaGoEvent[] = data.results || [];
      setTotal(data.count ?? null);
      setHasMore(!!data.next || newEvents.length === PAGE_SIZE);
      setEvents(prev => append ? [...prev, ...newEvents] : newEvents);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => { fetchEvents(1); }, []);

  const handleLoadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchEvents(next, true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Шапка */}
      <div className="bg-white border-b border-gray-100">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-black text-gray-900">
            События в Казани
          </h1>
          {total !== null && !loading && (
            <p className="text-gray-400 mt-1 text-sm">
              {total.toLocaleString('ru-RU')} мероприятий найдено
            </p>
          )}
        </div>
      </div>

      <main className="container mx-auto px-4 py-10">
        {/* Skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100 animate-pulse">
                <div className="h-48 bg-gray-100" />
                <div className="p-4 space-y-3">
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                  <div className="h-4 bg-gray-100 rounded w-full" />
                  <div className="h-4 bg-gray-100 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex flex-col items-center py-24 gap-4">
            <span className="text-5xl">😕</span>
            <p className="text-gray-600 text-lg">Не удалось загрузить события</p>
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={() => fetchEvents(1)}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl hover:bg-indigo-700 font-semibold transition">
              Попробовать снова
            </button>
          </div>
        )}

        {/* Grid */}
        {!loading && !error && (
          <>
            {events.length === 0 ? (
              <div className="text-center py-24 text-gray-300">
                <div className="text-6xl mb-4">🎭</div>
                <p className="text-lg">Событий не найдено</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {events.map(event => (
                  <EventCard key={event.kudago_id} event={event} />
                ))}
              </div>
            )}

            {hasMore && events.length > 0 && (
              <div className="flex justify-center mt-12">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 bg-white border-2 border-indigo-200 text-indigo-600 px-8 py-3 rounded-2xl font-semibold hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Загружаем...
                    </>
                  ) : 'Загрузить ещё'}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
