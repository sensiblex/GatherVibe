'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Navbar from '../components/Navbar';
import EventCard, { KudaGoEvent } from '../components/EventCard';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const PAGE_SIZE = 12;

interface Category { slug: string; name: string; }

// ──────────────────────────────────────────────
// Helpers — NO UTC conversion, use local date parts only
// ──────────────────────────────────────────────

/** Returns "YYYY-MM-DD" using LOCAL year/month/day (no UTC shift) */
function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Unix timestamp for start of a local date (00:00:00 local time) */
function localStartTs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(new Date(y, m - 1, d, 0, 0, 0).getTime() / 1000);
}

/** Unix timestamp for end of a local date (23:59:59 local time) */
function localEndTs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(new Date(y, m - 1, d, 23, 59, 59).getTime() / 1000);
}

/** Format "YYYY-MM-DD" to Russian locale display without UTC shift */
function displayDate(dateStr: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', opts);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number) {
  // Mon=0 … Sun=6
  const day = new Date(year, month, 1).getDay();
  return (day + 6) % 7;
}

const RU_MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
const RU_DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// ──────────────────────────────────────────────
// EventCalendar
// ──────────────────────────────────────────────
function EventCalendar({
  events,
  selectedDate,
  onSelectDate,
}: {
  events: KudaGoEvent[];
  selectedDate: string | null;
  onSelectDate: (d: string | null) => void;
}) {
  const today = new Date();
  const todayStr = localIsoDate(today);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Build a Set of dates that have events: "YYYY-MM-DD"
  const eventDates = new Set<string>();
  events.forEach(e => { if (e.start_date) eventDates.add(e.start_date); });

  const days = daysInMonth(viewYear, viewMonth);
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
    // Use local date parts — no UTC conversion
    const y = viewYear;
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    const cellStr = `${y}-${m}-${d}`;
    onSelectDate(selectedDate === cellStr ? null : cellStr);
  };

  // Cells
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 select-none">
      <div className="flex items-center justify-between mb-4">
        <button onClick={prevMonth}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 transition">
          ‹
        </button>
        <h2 className="font-bold text-gray-800 text-sm">{RU_MONTHS[viewMonth]} {viewYear}</h2>
        <button onClick={nextMonth}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-500 transition">
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {RU_DAYS_SHORT.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;

          const y = viewYear;
          const m = String(viewMonth + 1).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          const cellStr = `${y}-${m}-${dd}`;

          const isToday = cellStr === todayStr;
          const hasEvent = eventDates.has(cellStr);
          const isSelected = selectedDate === cellStr;
          const isPast = cellStr < todayStr; // string comparison works for ISO dates

          return (
            <button
              key={idx}
              onClick={() => handleDay(day)}
              disabled={isPast && !hasEvent}
              className={[
                'relative flex flex-col items-center justify-center h-9 w-full rounded-xl text-xs font-semibold transition',
                isSelected
                  ? 'bg-indigo-600 text-white shadow-md'
                  : isToday
                    ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-300'
                    : hasEvent
                      ? 'bg-purple-50 text-purple-700 hover:bg-purple-100 cursor-pointer'
                      : isPast
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'text-gray-700 hover:bg-gray-100',
              ].join(' ')}
            >
              {day}
              {hasEvent && !isSelected && (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-purple-400" />
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-indigo-600 font-semibold">
            📅 {displayDate(selectedDate, { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <button onClick={() => onSelectDate(null)}
            className="text-xs text-gray-400 hover:text-red-500 transition">
            Сбросить ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────
export default function EventsPage() {
  const [events, setEvents]           = useState<KudaGoEvent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(true);
  const [total, setTotal]             = useState<number | null>(null);

  const [allEvents, setAllEvents]     = useState<KudaGoEvent[]>([]);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');
  const [category, setCategory]       = useState('');
  const [isFree, setIsFree]           = useState(false);
  const [categories, setCategories]   = useState<Category[]>([]);

  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null);
  const [calOpen, setCalOpen]         = useState(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const todayStr = localIsoDate(new Date());

  useEffect(() => {
    fetch(`${API_BASE}/kudago/categories`)
      .then(r => r.json())
      .then((d: Category[]) => { if (Array.isArray(d)) setCategories(d); })
      .catch(() => {});
    // Load large batch for calendar dots (no date filter)
    fetch(`${API_BASE}/kudago/events?location=kzn&page=1&page_size=100`)
      .then(r => r.json())
      .then(d => setAllEvents(d.results || []))
      .catch(() => {});
  }, []);

  const handleCalendarDate = (d: string | null) => {
    setCalSelectedDate(d);
    setDateFrom(d ?? '');
    setDateTo(d ?? '');
  };

  const load = useCallback(async (
    pageNum: number,
    s: string,
    cat: string,
    free: boolean,
    from: string,
    to: string,
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
      if (s.trim()) params.set('search', s.trim());
      if (cat)      params.set('categories', cat);
      if (free)     params.set('is_free', 'true');

      // Use local timestamps to avoid UTC off-by-one
      if (from) params.set('actual_since', String(localStartTs(from)));
      if (to)   params.set('actual_until', String(localEndTs(to)));

      const res = await fetch(`${API_BASE}/kudago/events?${params}`);
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data = await res.json();
      const incoming: KudaGoEvent[] = data.results || [];
      setTotal(data.count ?? null);
      setHasMore(!!data.next || incoming.length === PAGE_SIZE);

      // Client-side date guard: filter out events outside selected range
      const filtered = (from || to)
        ? incoming.filter(e => {
            if (!e.start_date) return false;
            if (from && e.start_date < from) return false;
            if (to   && e.start_date > to)   return false;
            return true;
          })
        : incoming;

      setEvents(prev => append ? [...prev, ...filtered] : filtered);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    load(1, search, category, isFree, dateFrom, dateTo, false);
  }, [search, category, isFree, dateFrom, dateTo, load]);

  const onSearchChange = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 500);
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    load(next, search, category, isFree, dateFrom, dateTo, true);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setCategory('');
    setIsFree(false);
    setDateFrom('');
    setDateTo('');
    setCalSelectedDate(null);
  };

  const hasActive = !!(search || category || isFree || dateFrom || dateTo);

  // ── ФИКС: если выбрана дата через календарь, API вернул пусто,
  // но в allEvents есть события на эту дату — показываем их напрямую
  const calDateFallbackEvents: KudaGoEvent[] = (
    calSelectedDate && !loading && events.length === 0 && !error
      ? allEvents.filter(e => e.start_date === calSelectedDate)
      : []
  );
  const displayEvents = calDateFallbackEvents.length > 0 ? calDateFallbackEvents : events;
  const isFallback = calDateFallbackEvents.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="bg-white border-b border-gray-100">
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-black text-gray-900">События в Казани</h1>
          {total !== null && !loading && (
            <p className="text-gray-400 mt-1 text-sm">{total.toLocaleString('ru-RU')} мероприятий</p>
          )}

          <div className="mt-5 flex flex-wrap gap-3 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" value={searchInput} onChange={e => onSearchChange(e.target.value)}
                placeholder="Поиск событий..."
                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition" />
            </div>

            {/* Category */}
            {categories.length > 0 && (
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition">
                <option value="">Все категории</option>
                {categories.map(cat => <option key={cat.slug} value={cat.slug}>{cat.name}</option>)}
              </select>
            )}

            {/* Free */}
            <button onClick={() => setIsFree(v => !v)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
                isFree ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700'
              }`}>
              🄓 Бесплатно
            </button>

            {/* Date from */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-400 font-medium whitespace-nowrap">С</label>
              <input type="date" value={dateFrom} min={todayStr}
                onChange={e => {
                  setDateFrom(e.target.value);
                  setCalSelectedDate(null);
                  if (dateTo && e.target.value > dateTo) setDateTo(e.target.value);
                }}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition cursor-pointer" />
            </div>

            {/* Date to */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-400 font-medium whitespace-nowrap">По</label>
              <input type="date" value={dateTo} min={dateFrom || todayStr}
                onChange={e => { setDateTo(e.target.value); setCalSelectedDate(null); }}
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition cursor-pointer" />
            </div>

            {/* Clear */}
            {hasActive && (
              <button onClick={clearFilters}
                className="px-4 py-2.5 rounded-xl text-sm text-gray-400 border border-gray-200 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition">
                Сбросить ✕
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-8">

          {/* ── LEFT: calendar sidebar ── */}
          <aside className="lg:w-72 shrink-0">
            <div className="sticky top-4 space-y-4">
              <button onClick={() => setCalOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-2xl border border-gray-100 shadow-sm text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">
                <span>📅 Календарь событий</span>
                <span className="text-gray-400">{calOpen ? '▲' : '▼'}</span>
              </button>

              {calOpen && (
                <EventCalendar
                  events={allEvents}
                  selectedDate={calSelectedDate}
                  onSelectDate={handleCalendarDate}
                />
              )}

              {/* Events list for selected date */}
              {calSelectedDate && (() => {
                const dayEvents = allEvents.filter(e => e.start_date === calSelectedDate);
                return (
                  <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-4">
                    <p className="text-xs font-bold text-indigo-700 uppercase tracking-wide mb-2">
                      События {displayDate(calSelectedDate, { day: 'numeric', month: 'long' })}
                    </p>
                    {dayEvents.length === 0 ? (
                      <p className="text-xs text-gray-400">Событий не найдено</p>
                    ) : (
                      <ul className="space-y-2">
                        {dayEvents.slice(0, 5).map(e => (
                          <li key={e.kudago_id}>
                            <a href={`/events/${e.kudago_id}`}
                              className="text-xs text-indigo-700 font-semibold hover:underline line-clamp-2 leading-tight block">
                              {e.title}
                            </a>
                            {e.place_title && <p className="text-[10px] text-gray-400 mt-0.5">{e.place_title}</p>}
                          </li>
                        ))}
                        {dayEvents.length > 5 && (
                          <p className="text-[10px] text-indigo-400">и ещё {dayEvents.length - 5}...</p>
                        )}
                      </ul>
                    )}
                  </div>
                );
              })()}

              {/* Quick filters */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Быстрые фильтры</p>
                {([
                  { label: '🕐 Сегодня', offset: 0 },
                  { label: '📆 Завтра', offset: 1 },
                  { label: '🗓 Эта неделя', offset: 7 },
                  { label: '📅 Этот месяц', offset: 30 },
                ] as { label: string; offset: number }[]).map(({ label, offset }) => {
                  const fromDate = new Date();
                  if (offset === 1) fromDate.setDate(fromDate.getDate() + 1);
                  const toDate = new Date();
                  toDate.setDate(toDate.getDate() + offset);
                  const fromStr = localIsoDate(fromDate);
                  const toStr   = localIsoDate(toDate);
                  const isActive = dateFrom === fromStr && dateTo === toStr;

                  return (
                    <button key={label}
                      onClick={() => {
                        if (isActive) { setDateFrom(''); setDateTo(''); setCalSelectedDate(null); }
                        else { setDateFrom(fromStr); setDateTo(toStr); setCalSelectedDate(offset <= 1 ? fromStr : null); }
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm transition font-medium ${
                        isActive ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'
                      }`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* ── RIGHT: events grid ── */}
          <div className="flex-1 min-w-0">
            {(dateFrom || dateTo) && (
              <div className="mb-5 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                  📅
                  {dateFrom && dateTo && dateFrom === dateTo
                    ? displayDate(dateFrom, { day: 'numeric', month: 'long' })
                    : [
                        dateFrom && `с ${displayDate(dateFrom, { day: 'numeric', month: 'short' })}`,
                        dateTo   && `по ${displayDate(dateTo,   { day: 'numeric', month: 'short' })}`,
                      ].filter(Boolean).join(' ')}
                  <button onClick={() => { setDateFrom(''); setDateTo(''); setCalSelectedDate(null); }}
                    className="ml-1 hover:text-red-500 transition">✕</button>
                </span>
                {isFallback && (
                  <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                    ⚡ Показаны события из общей выборки
                  </span>
                )}
              </div>
            )}

            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
                <button onClick={() => load(1, search, category, isFree, dateFrom, dateTo, false)}
                  className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl hover:bg-indigo-700 font-semibold transition">
                  Попробовать снова
                </button>
              </div>
            )}

            {!loading && !error && (
              <>
                {displayEvents.length === 0 ? (
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {displayEvents.map(event => <EventCard key={event.kudago_id} event={event} />)}
                  </div>
                )}

                {!isFallback && hasMore && events.length > 0 && (
                  <div className="flex justify-center mt-12">
                    <button onClick={loadMore} disabled={loadingMore}
                      className="flex items-center gap-2 bg-white border-2 border-indigo-200 text-indigo-600 px-8 py-3 rounded-2xl font-semibold hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all disabled:opacity-50">
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
          </div>
        </div>
      </main>
    </div>
  );
}
