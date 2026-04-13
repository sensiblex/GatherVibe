'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import EventCard, { KudaGoEvent } from '../components/EventCard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const PAGE_SIZE = 12;

interface Category { slug: string; name: string; }

function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function localStartTs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(new Date(y, m - 1, d, 0, 0, 0).getTime() / 1000);
}
function localEndTs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(new Date(y, m - 1, d, 23, 59, 59).getTime() / 1000);
}
function displayDate(dateStr: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', opts);
}
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function firstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return (day + 6) % 7;
}

const RU_MONTHS = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
];
const RU_DAYS_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

function EventCalendar({
  events, selectedDate, onSelectDate, todayStr,
}: {
  events: KudaGoEvent[];
  selectedDate: string | null;
  onSelectDate: (d: string | null) => void;
  todayStr: string;
}) {
  const today = new Date();
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const eventDates = new Set<string>();
  events.forEach(e => { if (e.start_date) eventDates.add(e.start_date); });

  const days     = daysInMonth(viewYear, viewMonth);
  const firstDay = firstDayOfMonth(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const handleDay = (day: number) => {
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    const cellStr = `${viewYear}-${m}-${d}`;
    onSelectDate(selectedDate === cellStr ? null : cellStr);
  };

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div
      className="rounded-2xl p-5 select-none"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="w-8 h-8 flex items-center justify-center rounded-xl transition"
          style={{ color: 'var(--text-muted)' }}
        >&#8249;</button>
        <h2 className="font-bold text-sm" style={{ color: 'var(--text)' }}>
          {RU_MONTHS[viewMonth]} {viewYear}
        </h2>
        <button
          onClick={nextMonth}
          className="w-8 h-8 flex items-center justify-center rounded-xl transition"
          style={{ color: 'var(--text-muted)' }}
        >&#8250;</button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {RU_DAYS_SHORT.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold py-1"
            style={{ color: 'var(--text-faint)' }}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;
          const m = String(viewMonth + 1).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          const cellStr = `${viewYear}-${m}-${dd}`;
          const isToday    = cellStr === todayStr;
          const hasEvent   = eventDates.has(cellStr);
          const isSelected = selectedDate === cellStr;
          const isPast     = cellStr < todayStr;

          let bg = 'transparent';
          let color = 'var(--text)';
          let ring = '';

          if (isSelected) { bg = 'var(--primary)'; color = 'var(--text-inverse)'; }
          else if (isToday) { bg = 'var(--primary-hl)'; color = 'var(--primary)'; ring = '1px solid var(--primary)'; }
          else if (hasEvent) { bg = 'var(--surface-off)'; color = 'var(--primary)'; }
          else if (isPast) { color = 'var(--text-faint)'; }

          return (
            <button
              key={idx}
              onClick={() => handleDay(day)}
              disabled={isPast && !hasEvent}
              suppressHydrationWarning
              className="relative flex flex-col items-center justify-center h-9 w-full rounded-xl text-xs font-semibold transition"
              style={{ background: bg, color, outline: ring ? `${ring}` : undefined, cursor: isPast && !hasEvent ? 'not-allowed' : 'pointer' }}
            >
              {day}
              {hasEvent && !isSelected && (
                <span
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ background: 'var(--primary)' }}
                />
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div
          className="mt-3 pt-3 flex items-center justify-between"
          style={{ borderTop: '1px solid var(--divider)' }}
        >
          <p className="text-xs font-semibold" style={{ color: 'var(--primary)' }}>
            📅 {displayDate(selectedDate, { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <button
            onClick={() => onSelectDate(null)}
            className="text-xs transition"
            style={{ color: 'var(--text-faint)' }}
          >
            Сбросить ×
          </button>
        </div>
      )}
    </div>
  );
}

export default function EventsPage() {
  const [events, setEvents]           = useState<KudaGoEvent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(true);
  const [total, setTotal]             = useState<number | null>(null);
  const [allEvents, setAllEvents]     = useState<KudaGoEvent[]>([]);
  const [searchVariants, setSearchVariants] = useState<string[]>([]);
  const [attendeesMap, setAttendeesMap] = useState<Record<number, { user_id: number; username: string; avatar_url?: string | null }[]>>({});

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');
  const [category, setCategory]       = useState('');
  const [isFree, setIsFree]           = useState(false);
  const [categories, setCategories]   = useState<Category[]>([]);
  const [sortBy, setSortBy]           = useState<'date' | 'price' | 'participants'>('date');

  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null);
  const [calOpen, setCalOpen]         = useState(true);
  const [isSingleDayFilter, setIsSingleDayFilter] = useState(false);

  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef  = useRef<HTMLDivElement>(null);
  const loadingRef   = useRef(false);
  const [todayStr, setTodayStr] = useState('');
  const router = useRouter();

  useEffect(() => {
    setTodayStr(localIsoDate(new Date()));
  }, []);

  // Читаем начальные значения фильтров из URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const q = p.get('search') || '';
    if (q) { setSearchInput(q); setSearch(q); }
    if (p.get('category'))   setCategory(p.get('category')!);
    if (p.get('is_free') === 'true') setIsFree(true);
    if (p.get('date_from'))  setDateFrom(p.get('date_from')!);
    if (p.get('date_to'))    setDateTo(p.get('date_to')!);
    if (p.get('sort_by') && ['date', 'price', 'participants'].includes(p.get('sort_by')!))
      setSortBy(p.get('sort_by') as 'date' | 'price' | 'participants');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/kudago/categories`)
      .then(r => r.json())
      .then((d: Category[]) => { if (Array.isArray(d)) setCategories(d); })
      .catch(() => {});
    fetch(`${API_BASE}/kudago/events?location=kzn&page=1&page_size=100`)
      .then(r => r.json())
      .then(d => setAllEvents(d.results || []))
      .catch(() => {});
  }, []);

  // Синхронизируем фильтры с URL (replace, чтобы не засорять историю)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams();
    if (search)    p.set('search',    search);
    if (category)  p.set('category',  category);
    if (isFree)    p.set('is_free',   'true');
    if (dateFrom)  p.set('date_from', dateFrom);
    if (dateTo)    p.set('date_to',   dateTo);
    if (sortBy !== 'date') p.set('sort_by', sortBy);
    const qs = p.toString();
    router.replace(qs ? `/events?${qs}` : '/events', { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, isFree, dateFrom, dateTo, sortBy]);

  const handleCalendarDate = (d: string | null) => {
    setCalSelectedDate(d);
    setDateFrom(d ?? '');
    setDateTo(d ?? '');
    setIsSingleDayFilter(!!d);
  };

  const load = useCallback(async (
    pageNum: number, s: string, cat: string,
    free: boolean, from: string, to: string,
    append: boolean, singleDay: boolean,
  ) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        location: 'kzn', page: String(pageNum), page_size: String(PAGE_SIZE),
      });
      if (s.trim()) params.set('search', s.trim());
      if (cat)      params.set('categories', cat);
      if (free)     params.set('is_free', 'true');
      if (from) params.set('actual_since', String(localStartTs(from)));
      if (to)   params.set('actual_until', String(localEndTs(to)));

      const res = await fetch(`${API_BASE}/kudago/events?${params}`);
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data = await res.json();
      const incoming: KudaGoEvent[] = data.results || [];
      setTotal(data.count ?? null);
      setHasMore(!!data.next || incoming.length === PAGE_SIZE);
      // Показываем варианты запроса только если были задействованы fallback-варианты
      if (!append) {
        const variants: string[] = data._variants_used || [];
        setSearchVariants(variants.length > 1 ? variants.slice(1) : []);
      }

      const filtered = singleDay && (from || to)
        ? incoming.filter(e => {
            if (e.is_permanent) return true;
            if (!e.start_date) return false;
            if (from && e.start_date < from) return false;
            if (to && e.start_date > to) return false;
            return true;
          })
        : incoming;

      setEvents(prev => {
        if (!append) return filtered;
        const seen = new Set(prev.map(e => e.kudago_id));
        return [...prev, ...filtered.filter(e => !seen.has(e.kudago_id))];
      });

      // Батч-загрузка attendees для всех событий на странице
      const ids = filtered.map(e => e.kudago_id).filter(Boolean);
      if (ids.length > 0) {
        const results = await Promise.allSettled(
          ids.map(id => fetch(`${API_BASE}/attendees/${id}`).then(r => r.ok ? r.json() : []))
        );
        const newMap: Record<number, { user_id: number; username: string; avatar_url?: string | null }[]> = {};
        ids.forEach((id, i) => {
          const r = results[i];
          if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length > 0) {
            newMap[id] = r.value;
          }
        });
        setAttendeesMap(prev => append ? { ...prev, ...newMap } : newMap);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    setPage(1);
    loadingRef.current = false; // сбрасываем блокировку при смене фильтров
    load(1, search, category, isFree, dateFrom, dateTo, false, isSingleDayFilter);
  }, [search, category, isFree, dateFrom, dateTo, isSingleDayFilter, load]);

  const pageRef    = useRef(page);
  const hasMoreRef = useRef(hasMore);
  const searchRef        = useRef(search);
  const categoryRef      = useRef(category);
  const isFreeRef        = useRef(isFree);
  const dateFromRef      = useRef(dateFrom);
  const dateToRef        = useRef(dateTo);
  const isSingleDayRef   = useRef(isSingleDayFilter);
  const isFallbackRef    = useRef(false);
  const sortByRef        = useRef(sortBy);

  pageRef.current          = page;
  hasMoreRef.current       = hasMore;
  searchRef.current        = search;
  categoryRef.current      = category;
  isFreeRef.current        = isFree;
  dateFromRef.current      = dateFrom;
  dateToRef.current        = dateTo;
  isSingleDayRef.current   = isSingleDayFilter;
  sortByRef.current        = sortBy;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry.isIntersecting &&
          hasMoreRef.current &&
          !loadingRef.current &&
          !isFallbackRef.current
        ) {
          const next = pageRef.current + 1;
          setPage(next);
          load(
            next,
            searchRef.current,
            categoryRef.current,
            isFreeRef.current,
            dateFromRef.current,
            dateToRef.current,
            true,
            isSingleDayRef.current,
          );
        }
      },
      {
        rootMargin: '0px 0px 200px 0px',
        threshold: 0,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [load]);

  const onSearchChange = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setSearch('');
    } else {
      debounceRef.current = setTimeout(() => setSearch(val), 500);
    }
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    load(next, search, category, isFree, dateFrom, dateTo, true, isSingleDayFilter);
  };

  const clearFilters = () => {
    setSearchInput(''); setSearch(''); setCategory('');
    setIsFree(false); setDateFrom(''); setDateTo('');
    setCalSelectedDate(null); setIsSingleDayFilter(false);
    setSortBy('date'); setSearchVariants([]);
  };

  const hasActive = !!(search || category || isFree || dateFrom || dateTo || sortBy !== 'date');

  const calDateFallbackEvents: KudaGoEvent[] = (
    calSelectedDate && !loading && events.length === 0 && !error
      ? allEvents.filter(e => e.start_date === calSelectedDate)
      : []
  );
  const baseEvents = calDateFallbackEvents.length > 0 ? calDateFallbackEvents : events;
  const isFallback = calDateFallbackEvents.length > 0;
  isFallbackRef.current = isFallback;

  // Клиентская сортировка для KudaGo-событий
  function parseKudaGoPrice(e: KudaGoEvent): number {
    if (e.is_free) return 0;
    const m = (e.price || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }
  const displayEvents = sortBy === 'date'
    ? baseEvents
    : [...baseEvents].sort((a, b) => {
        if (sortBy === 'price') return parseKudaGoPrice(a) - parseKudaGoPrice(b);
        // participants: нет данных у KudaGo — оставляем порядок API
        return 0;
      });

  const inputStyle = {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: '0.75rem',
    color: 'var(--text)',
    fontSize: '0.875rem',
    padding: '0.625rem 1rem',
    outline: 'none',
    transition: 'border-color 160ms, box-shadow 160ms',
  } as React.CSSProperties;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--divider)' }}>
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-black" style={{ color: 'var(--text)' }}>События в Казани</h1>
          {total !== null && !loading && (
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              {total.toLocaleString('ru-RU')} мероприятий
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-3 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: 'var(--text-faint)' }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text" value={searchInput}
                onChange={e => onSearchChange(e.target.value)}
                placeholder="Поиск событий..."
                style={{ ...inputStyle, paddingLeft: '2.25rem', width: '100%' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--primary-ring)'; }}
                onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border)';   e.currentTarget.style.boxShadow = 'none'; }}
              />
            </div>

            {/* Category */}
            {categories.length > 0 && (
              <select value={category} onChange={e => setCategory(e.target.value)}
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
                onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <option value="">Все категории</option>
                {categories.map(cat => <option key={cat.slug} value={cat.slug}>{cat.name}</option>)}
              </select>
            )}

            {/* Free */}
            <button
              onClick={() => setIsFree(v => !v)}
              className="px-4 py-2.5 rounded-xl text-sm font-medium transition"
              style={{
                background: isFree ? 'var(--success)' : 'var(--surface-2)',
                color: isFree ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              🆓 Бесплатно
            </button>

            {/* Date from */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>С</label>
              <input type="date" value={dateFrom} min={todayStr}
                suppressHydrationWarning
                onChange={e => {
                  setDateFrom(e.target.value);
                  setCalSelectedDate(null);
                  setIsSingleDayFilter(false);
                  if (dateTo && e.target.value > dateTo) setDateTo(e.target.value);
                }}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
                onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              />
            </div>

            {/* Date to */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>По</label>
              <input type="date" value={dateTo} min={dateFrom || todayStr}
                suppressHydrationWarning
                onChange={e => {
                  setDateTo(e.target.value);
                  setCalSelectedDate(null);
                  setIsSingleDayFilter(false);
                }}
                style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
                onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              />
            </div>

            {/* Sort by */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'date' | 'price' | 'participants')}
              style={inputStyle}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--primary)'; }}
              onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <option value="date">По дате</option>
              <option value="price">По цене</option>
              <option value="participants">По популярности</option>
            </select>

            {hasActive && (
              <button onClick={clearFilters}
                className="px-4 py-2.5 rounded-xl text-sm transition"
                style={{
                  background: 'var(--surface-2)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
              >
                Сбросить ×
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">

          {/* Sidebar */}
          <aside className="lg:w-72 shrink-0">
            <div className="sticky top-4 space-y-4">
              <button
                onClick={() => setCalOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <span>📅 Календарь событий</span>
                <span style={{ color: 'var(--text-faint)' }}>{calOpen ? '▲' : '▼'}</span>
              </button>

              {calOpen && (
                <EventCalendar
                  events={allEvents}
                  selectedDate={calSelectedDate}
                  onSelectDate={handleCalendarDate}
                  todayStr={todayStr}
                />
              )}

              {calSelectedDate && (() => {
                const dayEvents = allEvents.filter(e => e.start_date === calSelectedDate);
                return (
                  <div
                    className="rounded-2xl p-4"
                    style={{
                      background: 'var(--primary-hl)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--primary)' }}>
                      События {displayDate(calSelectedDate, { day: 'numeric', month: 'long' })}
                    </p>
                    {dayEvents.length === 0 ? (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Событий не найдено</p>
                    ) : (
                      <ul className="space-y-2">
                        {dayEvents.slice(0, 5).map(e => (
                          <li key={e.kudago_id}>
                            <a href={`/events/${e.kudago_id}`}
                              className="text-xs font-semibold hover:underline line-clamp-2 leading-tight block"
                              style={{ color: 'var(--primary)' }}>
                              {e.title}
                            </a>
                            {e.place_title && (
                              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                {e.place_title}
                              </p>
                            )}
                          </li>
                        ))}
                        {dayEvents.length > 5 && (
                          <p className="text-[10px]" style={{ color: 'var(--primary)' }}>
                            и ещё {dayEvents.length - 5}...
                          </p>
                        )}
                      </ul>
                    )}
                  </div>
                );
              })()}

              {/* Quick filters */}
              <div
                className="rounded-2xl p-4 space-y-2"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-faint)' }}>
                  Быстрые фильтры
                </p>
                {([
                  { label: '🕐 Сегодня',     offset: 0 },
                  { label: '📆 Завтра',      offset: 1 },
                  { label: '🗓 Эта неделя',  offset: 7 },
                  { label: '📅 Этот месяц', offset: 30 },
                ] as { label: string; offset: number }[]).map(({ label, offset }) => {
                  const fromDate = new Date();
                  if (offset === 1) fromDate.setDate(fromDate.getDate() + 1);
                  const toDate = new Date();
                  toDate.setDate(toDate.getDate() + offset);
                  const fromStr = localIsoDate(fromDate);
                  const toStr   = localIsoDate(toDate);
                  const isActv  = dateFrom === fromStr && dateTo === toStr;
                  const isSingle = offset <= 1;

                  return (
                    <button key={label}
                      onClick={() => {
                        if (isActv) {
                          setDateFrom(''); setDateTo('');
                          setCalSelectedDate(null);
                          setIsSingleDayFilter(false);
                        } else {
                          setDateFrom(fromStr); setDateTo(toStr);
                          setCalSelectedDate(isSingle ? fromStr : null);
                          setIsSingleDayFilter(isSingle);
                        }
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-sm transition font-medium"
                      style={{
                        background: isActv ? 'var(--primary)' : 'transparent',
                        color: isActv ? 'var(--text-inverse)' : 'var(--text-muted)',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {(dateFrom || dateTo) && (
              <div className="mb-5 flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{
                    background: 'var(--primary-hl)',
                    border: '1px solid var(--border)',
                    color: 'var(--primary)',
                  }}
                >
                  📅
                  {dateFrom && dateTo && dateFrom === dateTo
                    ? displayDate(dateFrom, { day: 'numeric', month: 'long' })
                    : [
                        dateFrom && `с ${displayDate(dateFrom, { day: 'numeric', month: 'short' })}`,
                        dateTo   && `по ${displayDate(dateTo,   { day: 'numeric', month: 'short' })}`,
                      ].filter(Boolean).join(' ')}
                  <button
                    onClick={() => { setDateFrom(''); setDateTo(''); setCalSelectedDate(null); setIsSingleDayFilter(false); }}
                    className="ml-1 transition"
                    style={{ color: 'var(--text-faint)' }}
                  >×</button>
                </span>
                {isFallback && (
                  <span
                    className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full"
                    style={{ background: 'var(--warning-hl)', color: 'var(--warning)', border: '1px solid var(--warning-hl)' }}
                  >
                    ⚡ Показаны события из общей выборки
                  </span>
                )}
              </div>
            )}

            {/* Smart search hints */}
            {!loading && searchVariants.length > 0 && search && (
              <div
                className="mb-5 flex items-start gap-2 flex-wrap rounded-2xl px-4 py-3"
                style={{
                  background: 'var(--primary-hl)',
                  border: '1px solid var(--border)',
                }}
              >
                <span className="text-xs font-semibold shrink-0 mt-0.5" style={{ color: 'var(--primary)' }}>
                  🔍 Также искали:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {searchVariants.map(v => (
                    <button
                      key={v}
                      onClick={() => { setSearchInput(v); setSearch(v); setSearchVariants([]); }}
                      className="text-xs font-medium px-2.5 py-1 rounded-full transition hover:opacity-80"
                      style={{
                        background: 'var(--surface)',
                        color: 'var(--primary)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Skeleton */}
            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <div key={i} className="rounded-2xl overflow-hidden animate-pulse"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="h-48" style={{ background: 'var(--surface-2)' }} />
                    <div className="p-4 space-y-3">
                      <div className="h-3 rounded w-1/3" style={{ background: 'var(--surface-2)' }} />
                      <div className="h-4 rounded w-full" style={{ background: 'var(--surface-2)' }} />
                      <div className="h-4 rounded w-2/3" style={{ background: 'var(--surface-2)' }} />
                      <div className="h-3 rounded w-1/2" style={{ background: 'var(--surface-2)' }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex flex-col items-center py-24 gap-4">
                <span className="text-5xl">😕</span>
                <p className="text-lg" style={{ color: 'var(--text)' }}>Не удалось загрузить события</p>
                <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
                <button
                  onClick={() => load(1, search, category, isFree, dateFrom, dateTo, false, isSingleDayFilter)}
                  className="gv-btn-primary"
                >
                  Попробовать снова
                </button>
              </div>
            )}

            {/* Results */}
            {!loading && !error && (
              <>
                {displayEvents.length === 0 ? (
                  <div className="flex flex-col items-center py-24 gap-4 text-center">
                    <span className="text-6xl">🎭</span>
                    <p className="text-lg" style={{ color: 'var(--text-muted)' }}>Ничего не найдено</p>
                    {hasActive && (
                      <button onClick={clearFilters}
                        className="text-sm font-medium transition"
                        style={{ color: 'var(--primary)' }}
                      >
                        Сбросить фильтры
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {displayEvents.map(event => <EventCard key={event.kudago_id} event={event} attendees={attendeesMap[event.kudago_id] ?? []} />)}
                  </div>
                )}

                {/* sentinel — невидимый div, за которым следит IntersectionObserver */}
                {!isFallback && hasMore && events.length > 0 && (
                  <div ref={sentinelRef} className="mt-10 flex flex-col items-center gap-3">
                    {loadingMore && (
                      <div className="flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                        <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10"
                            stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor"
                            d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span className="text-sm font-medium">Загружаем...</span>
                      </div>
                    )}
                    {!loadingMore && (
                      <button
                        onClick={loadMore}
                        className="flex items-center gap-2 px-8 py-3 rounded-2xl font-semibold transition"
                        style={{
                          background: 'var(--surface)',
                          border: '2px solid var(--primary)',
                          color: 'var(--primary)',
                        }}
                      >
                        Загрузить ещё
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
