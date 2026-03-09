'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
      if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);

      const data = await res.json();
      const newEvents: KudaGoEvent[] = data.results || [];

      setTotal(data.count ?? null);
      setHasMore(!!data.next || newEvents.length === PAGE_SIZE);
      setEvents((prev) => (append ? [...prev, ...newEvents] : newEvents));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchEvents(1);
  }, []);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchEvents(nextPage, true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Навбар */}
      <nav className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold text-blue-600">
            GatherVibe
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/events" className="text-blue-600 font-semibold">
              События
            </Link>
            <Link href="/login" className="text-gray-600 hover:text-blue-600 transition">
              Войти
            </Link>
            <Link
              href="/register"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Регистрация
            </Link>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-10">
        {/* Заголовок */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            События в Казани
          </h1>
          {total !== null && !loading && (
            <p className="text-gray-500 mt-1">
              Найдено {total.toLocaleString('ru-RU')} мероприятий
            </p>
          )}
        </div>

        {/* Состояние: загрузка */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-md overflow-hidden animate-pulse">
                <div className="h-48 bg-gray-200" />
                <div className="p-4 space-y-3">
                  <div className="h-3 bg-gray-200 rounded w-1/3" />
                  <div className="h-4 bg-gray-200 rounded w-full" />
                  <div className="h-4 bg-gray-200 rounded w-2/3" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Состояние: ошибка */}
        {error && (
          <div className="flex flex-col items-center py-24 gap-4">
            <div className="text-5xl">😕</div>
            <p className="text-gray-600 text-lg">Не удалось загрузить события</p>
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => fetchEvents(1)}
              className="mt-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Попробовать снова
            </button>
          </div>
        )}

        {/* Сетка карточек */}
        {!loading && !error && (
          <>
            {events.length === 0 ? (
              <div className="text-center py-24 text-gray-400">
                <div className="text-5xl mb-4">🎭</div>
                <p className="text-lg">Событий не найдено</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {events.map((event) => (
                  <EventCard key={event.kudago_id} event={event} />
                ))}
              </div>
            )}

            {/* Кнопка «Загрузить ещё» */}
            {hasMore && events.length > 0 && (
              <div className="flex justify-center mt-10">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="bg-white border-2 border-blue-600 text-blue-600 px-8 py-3 rounded-xl font-semibold
                             hover:bg-blue-600 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Загружаем...
                    </span>
                  ) : (
                    'Загрузить ещё'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
