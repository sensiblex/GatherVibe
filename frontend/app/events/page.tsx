'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Navbar from '../components/Navbar';
import EventCard, { KudaGoEvent } from '../components/EventCard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const PAGE_SIZE = 12;

interface Category { slug: string; name: string; }

export default function EventsPage() {
  const [events, setEvents]           = useState<KudaGoEvent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(true);
  const [total, setTotal]             = useState<number | null>(null);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');
  const [category, setCategory]       = useState('');
  const [isFree, setIsFree]           = useState(false);
  const [categories, setCategories]   = useState<Category[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/kudago/categories`)
      .then(r => r.json())
      .then((d: Category[]) => { if (Array.isArray(d)) setCategories(d); })
      .catch(() => {});
  }, []);

  const load = useCallback(async (
    pageNum: number,
    s: string,
    cat: string,
    free: boolean,
    append: boolean,
  ) => {
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        location: 'kzn',
        page: String(pageNum),
        page_size: String(PAGE_SIZE),
      });
      if (s.trim())  params.set('search', s.trim());
      if (cat)       params.set('categories', cat);
      if (free)      params.set('is_free', 'true');

      const res = await fetch(`${API_BASE}/kudago/events?${params}`);
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data = await res.json();
      const incoming: KudaGoEvent[] = data.results || [];
      setTotal(data.count ?? null);
      setHasMore(!!data.next || incoming.length === PAGE_SIZE);
      setEvents(prev => append ? [...prev, ...incoming] : incoming);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    load(1, search, category, isFree, false);
  }, [search, category, isFree, load]);

  const onSearchChange = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 500);
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    load(next, search, category, isFree, true);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setCategory('');
    setIsFree(false);
  };

  const hasActive = !!(search || category || isFree);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="bg-white border-b border-gray-100">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-black text-gray-900">События в Казани</h1>
          {total !== null && !loading && (
            <p className="text-gray-400 mt-1 text-sm">
              {total.toLocaleString('ru-RU')} мероприятий
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={e => onSearchChange(e.target.value)}
                placeholder="Поиск событий..."
                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition"
              />
            </div>

            {categories.length > 0 && (
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition"
              >
                <option value="">Все категории</option>
                {categories.map(cat => (
                  <option key={cat.slug} value={cat.slug}>{cat.name}</option>
                ))}
              </select>
            )}

            <button
              onClick={() => setIsFree(v => !v)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
                isFree
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700'
              }`}
            >
              🄓 Бесплатно
            </button>

            {hasActive && (
              <button
                onClick={clearFilters}
                className="px-4 py-2.5 rounded-xl text-sm text-gray-400 border border-gray-200 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition"
              >
                Сбросить ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-10">
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

        {error && (
          <div className="flex flex-col items-center py-24 gap-4">
            <span className="text-5xl">😕</span>
            <p className="text-gray-600 text-lg">Не удалось загрузить события</p>
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => load(1, search, category, isFree, false)}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl hover:bg-indigo-700 font-semibold transition"
            >
              Попробовать снова
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {events.length === 0 ? (
              <div className="flex flex-col items-center py-24 gap-4 text-center">
                <span className="text-6xl">🎭</span>
                <p className="text-lg text-gray-500">Ничего не найдено</p>
                {hasActive && (
                  <button onClick={clearFilters}
                    className="text-sm text-indigo-600 font-medium hover:text-indigo-800 transition">
                    Сбросить фильтры
                  </button>
                )}
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
                  onClick={loadMore}
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
