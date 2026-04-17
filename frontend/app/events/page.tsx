'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

import Navbar from '../components/Navbar';
import { KudaGoEvent } from '../components/EventCard';
import EventDetailDrawer from './EventDetailDrawer';
import DateStrip from './DateStrip';
import MasonryEventCard from './MasonryEventCard';
import FeaturedCard from './FeaturedCard';
import CategoryPills from './CategoryPills';
import { apiFetch } from '../lib/apiFetch';
import { localIsoDate, localStartTs, localEndTs, displayDate } from './utils';

// ─── Constants ───────────────────────────────────────────────────────────────
const PAGE_SIZE = 60;

interface Category { slug: string; name: string; }

// ─── Masonry skeleton ────────────────────────────────────────────────────────
function MasonrySkeleton() {
  const heights = [180, 260, 220, 310, 200, 250, 190, 280, 240, 170, 300, 210];
  return (
    <div className="gv-masonry animate-pulse">
      {heights.map((h, i) => (
        <div
          key={i}
          className="gv-masonry-card rounded-2xl overflow-hidden"
          style={{ height: h, background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {h > 220 && (
            <div style={{ height: '55%', background: 'var(--surface-2)' }} />
          )}
          <div style={{ padding: '0.875rem' }}>
            <div className="h-3 w-3/4 rounded mb-2" style={{ background: 'var(--surface-2)' }} />
            <div className="h-3 w-1/2 rounded mb-2" style={{ background: 'var(--surface-2)' }} />
            <div className="h-3 w-2/3 rounded" style={{ background: 'var(--surface-2)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function EventsPage() {
  const [events, setEvents]       = useState<KudaGoEvent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [total, setTotal]         = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');
  const [category, setCategory]       = useState('');
  const [isFree, setIsFree]           = useState(false);
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [sortBy, setSortBy]           = useState<'date' | 'price'>('date');

  // Calendar & drawer state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<KudaGoEvent | null>(null);
  const [attendeeCounts, setAttendeeCounts] = useState<Record<string, number>>({});

  const [todayStr, setTodayStr] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef  = useRef(false);
  const router = useRouter();

  // SSR-safe today
  useEffect(() => {
    setTodayStr(localIsoDate(new Date()));
  }, []);

  // Read initial filters from URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const q = p.get('search') || '';
    if (q) { setSearchInput(q); setSearch(q); }
    if (p.get('category'))  setCategory(p.get('category')!);
    if (p.get('is_free') === 'true') setIsFree(true);
    if (p.get('date_from')) setDateFrom(p.get('date_from')!);
    if (p.get('date_to'))   setDateTo(p.get('date_to')!);
    if (p.get('sort_by') === 'price') setSortBy('price');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch categories once
  useEffect(() => {
    apiFetch('/kudago/categories')
      .then(r => r.json())
      .then((d: Category[]) => { if (Array.isArray(d)) setCategories(d); })
      .catch(() => {});
  }, []);

  // Sync filters to URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams();
    if (search)   p.set('search',    search);
    if (category) p.set('category',  category);
    if (isFree)   p.set('is_free',   'true');
    if (dateFrom) p.set('date_from', dateFrom);
    if (dateTo)   p.set('date_to',   dateTo);
    if (sortBy !== 'date') p.set('sort_by', sortBy);
    const qs = p.toString();
    router.replace(qs ? `/events?${qs}` : '/events', { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, isFree, dateFrom, dateTo, sortBy]);

  // Load events from API
  const load = useCallback(async (
    s: string, cat: string, free: boolean, from: string, to: string,
  ) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        location: 'kzn',
        page: '1',
        page_size: String(PAGE_SIZE),
      });
      if (s.trim()) params.set('search', s.trim());
      if (cat)      params.set('categories', cat);
      if (free)     params.set('is_free', 'true');
      if (from)     params.set('actual_since', String(localStartTs(from)));
      if (to)       params.set('actual_until', String(localEndTs(to)));

      const res = await apiFetch(`/kudago/events?${params}`);
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data = await res.json();
      const incoming: KudaGoEvent[] = data.results || [];
      setTotal(data.count ?? null);
      setEvents(incoming);

      // Fetch attendee counts in background
      if (incoming.length > 0) {
        const ids = incoming.map(e => String(e.kudago_id)).join(',');
        apiFetch(`/attendees/batch-counts?ids=${ids}`)
          .then(r => r.ok ? r.json() : {})
          .then((counts: Record<string, number>) => setAttendeeCounts(counts))
          .catch(() => {});
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadingRef.current = false;
    load(search, category, isFree, dateFrom, dateTo);
  }, [search, category, isFree, dateFrom, dateTo, load]);

  // Debounced search
  const onSearchChange = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setSearch('');
    } else {
      debounceRef.current = setTimeout(() => setSearch(val), 500);
    }
  };

  const clearFilters = () => {
    setSearchInput(''); setSearch(''); setCategory('');
    setIsFree(false); setDateFrom(''); setDateTo('');
    setSortBy('date'); setSelectedDate(null);
  };

  const hasActive = !!(search || category || isFree || dateFrom || dateTo || sortBy !== 'date');

  // Client-side sort
  const sortedEvents = useMemo(() => {
    if (sortBy !== 'price') return events;
    return [...events].sort((a, b) => {
      const pa = a.is_free ? 0 : parseInt((a.price || '').match(/\d+/)?.[0] ?? '0', 10);
      const pb = b.is_free ? 0 : parseInt((b.price || '').match(/\d+/)?.[0] ?? '0', 10);
      return pa - pb;
    });
  }, [events, sortBy]);

  // Events filtered by selected calendar date
  // Permanent events (is_permanent=true or start_date=null) always show
  const calendarEvents = useMemo(() => {
    if (!selectedDate) return sortedEvents;
    return sortedEvents.filter(e =>
      e.start_date === selectedDate ||
      e.is_permanent ||
      e.start_date === null
    );
  }, [sortedEvents, selectedDate]);

  // Set of dates that have events (for calendar dots)
  const eventDatesSet = useMemo(() => {
    const s = new Set<string>();
    sortedEvents.forEach(e => { if (e.start_date) s.add(e.start_date); });
    return s;
  }, [sortedEvents]);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar />

      <section className="events-section" style={{ borderTop: 'none' }}>

        {/* Header */}
        <div className="events-head">
          <div>
            <div className="t-label" style={{ marginBottom: 8 }}>Афиша</div>
            <h1 className="t-display">События в Казани</h1>
            {total !== null && !loading && (
              <p className="t-sm" style={{ marginTop: 8 }}>
                {total.toLocaleString('ru-RU')} мероприятий
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {hasActive && (
              <button onClick={clearFilters} className="btn btn-ghost btn-sm">
                Сбросить ×
              </button>
            )}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'date' | 'price')}
              className="input"
              style={{ width: 'auto', padding: '.5rem 1.125rem', fontSize: '.8125rem' }}
            >
              <option value="date">По дате</option>
              <option value="price">По цене</option>
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="events-search-row">
          <div className="input-wrap" style={{ flex: 1 }}>
            <svg className="input-ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="search"
              value={searchInput}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Поиск по событиям, площадкам, исполнителям…"
              className="input input-padl"
            />
          </div>
          <button
            onClick={() => setIsFree(v => !v)}
            className={isFree ? 'btn btn-ink' : 'btn btn-ghost'}
          >
            Бесплатно
          </button>
        </div>

        {/* Filters: date range + categories */}
        <div className="events-controls">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="date"
              value={dateFrom}
              min={todayStr}
              suppressHydrationWarning
              onChange={e => {
                setDateFrom(e.target.value);
                if (dateTo && e.target.value > dateTo) setDateTo(e.target.value);
              }}
              className="input"
              style={{ width: 'auto', padding: '.5rem 1rem', fontSize: '.8125rem' }}
            />
            <span className="t-xs" style={{ color: 'var(--text-dim)' }}>—</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || todayStr}
              suppressHydrationWarning
              onChange={e => setDateTo(e.target.value)}
              className="input"
              style={{ width: 'auto', padding: '.5rem 1rem', fontSize: '.8125rem' }}
            />
          </div>

          {(dateFrom || dateTo) && (
            <span className="badge badge-ink" style={{ gap: 6 }}>
              {dateFrom && dateTo && dateFrom === dateTo
                ? displayDate(dateFrom, { day: 'numeric', month: 'long' })
                : [
                    dateFrom && `с ${displayDate(dateFrom, { day: 'numeric', month: 'short' })}`,
                    dateTo   && `по ${displayDate(dateTo, { day: 'numeric', month: 'short' })}`,
                  ].filter(Boolean).join(' ')}
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                style={{ marginLeft: 4, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}
              >×</button>
            </span>
          )}

        </div>

        {categories.length > 0 && (
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px 40px', width: '100%', overflow: 'hidden' }}>
            <CategoryPills
              categories={categories}
              selected={category}
              onSelect={setCategory}
            />
          </div>
        )}

      {/* ── Main content ── */}
      <main className="events-body">

        {/* ── Error state ── */}
        {error && (
          <div className="flex flex-col items-center py-24 gap-4">
            <span className="text-5xl select-none">😕</span>
            <p className="text-lg" style={{ color: 'var(--text)' }}>Не удалось загрузить события</p>
            <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
            <button
              onClick={() => load(search, category, isFree, dateFrom, dateTo)}
              className="gv-btn-primary"
            >
              Попробовать снова
            </button>
          </div>
        )}

        {/* ── SECTION 1: Calendar + Masonry ── */}
        {!error && (
          <section className="mb-12">
            {/* Section heading */}
            <div className="flex items-center gap-3 mb-6">
              <div
                className="w-1 h-7 rounded-full"
                style={{ background: 'var(--primary)' }}
              />
              <h2 className="text-xl font-black" style={{ color: 'var(--text)' }}>
                Выберите дату
              </h2>
              {selectedDate && (
                <span
                  className="text-sm font-semibold px-3 py-1 rounded-full"
                  style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
                >
                  {displayDate(selectedDate, { day: 'numeric', month: 'long', weekday: 'short' })}
                </span>
              )}
            </div>

            {/* Date strip */}
            {!loading && !error && (
              <div className="mb-8">
                <DateStrip
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  eventDates={eventDatesSet}
                />
              </div>
            )}

            {/* Skeleton */}
            {loading && <MasonrySkeleton />}

            {/* Featured + Masonry grid */}
            {!loading && calendarEvents.length > 0 && (
              <>
                {/* Featured card — first event */}
                <div className="mb-6">
                  <FeaturedCard
                    event={calendarEvents[0]}
                    attendeeCount={attendeeCounts[String(calendarEvents[0].kudago_id)] ?? 0}
                    onClick={setSelectedEvent}
                  />
                </div>

                {/* Masonry grid — the rest */}
                {calendarEvents.length > 1 && (
                  <div className="gv-masonry">
                    {calendarEvents.slice(1).map(event => (
                      <MasonryEventCard
                        key={event.kudago_id}
                        event={event}
                        attendeeCount={attendeeCounts[String(event.kudago_id)] ?? 0}
                        onClick={setSelectedEvent}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Empty masonry state */}
            {!loading && calendarEvents.length === 0 && sortedEvents.length > 0 && (
              <div
                className="flex flex-col items-center py-12 gap-3 rounded-2xl"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <span className="text-4xl select-none">📅</span>
                <p className="text-base font-semibold" style={{ color: 'var(--text-muted)' }}>
                  На {displayDate(selectedDate!, { day: 'numeric', month: 'long' })} событий нет
                </p>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-sm font-medium transition"
                  style={{ color: 'var(--primary)' }}
                >
                  Показать все события
                </button>
              </div>
            )}

            {/* Global empty state */}
            {!loading && sortedEvents.length === 0 && !error && (
              <div className="flex flex-col items-center py-20 gap-4 text-center">
                <span className="text-6xl select-none">🎭</span>
                <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Ничего не найдено</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Попробуйте изменить фильтры или выбрать другой период
                </p>
                {hasActive && (
                  <button
                    onClick={clearFilters}
                    className="gv-btn-primary"
                  >
                    Сбросить фильтры
                  </button>
                )}
              </div>
            )}
          </section>
        )}

      </main>

      </section>

      {/* ── Event detail drawer ── */}
      {selectedEvent && (
        <EventDetailDrawer
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
