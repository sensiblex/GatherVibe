'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/apiFetch';

const PAGE_SIZE = 20;

interface PartyItem {
  id: number;
  event_id: string;
  title: string;
  description: string | null;
  max_members: number;
  creator_id: number;
  creator_username: string;
  is_open: boolean;
  city: string | null;
  member_count: number;
  created_at: string;
}

interface SearchResponse {
  items: PartyItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

// ─── Party Card ──────────────────────────────────────────────────────────────

function PartyCard({ party }: { party: PartyItem }) {
  const filled = party.member_count + 1; // +1 for creator
  const capacity = party.max_members;
  const pct = Math.min(100, Math.round((filled / capacity) * 100));
  const isFull = filled >= capacity;

  return (
    <Link
      href={`/parties/${party.id}`}
      className="group block rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Header strip */}
      <div
        className="h-2"
        style={{
          background: isFull
            ? 'var(--error)'
            : party.is_open
            ? 'linear-gradient(90deg, var(--primary), #a855f7)'
            : 'var(--text-faint)',
        }}
      />

      <div className="p-5">
        {/* Badges row */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span
            className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{
              background: isFull ? 'var(--error-hl)' : party.is_open ? 'var(--primary-hl)' : 'var(--surface-2)',
              color: isFull ? 'var(--error)' : party.is_open ? 'var(--primary)' : 'var(--text-faint)',
            }}
          >
            {isFull ? '🔒 Заполнена' : party.is_open ? '✅ Открыта' : '⛔ Закрыта'}
          </span>
          {party.city && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full"
              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
            >
              📍 {party.city}
            </span>
          )}
        </div>

        {/* Title */}
        <h3
          className="font-bold text-base leading-snug mb-1.5 line-clamp-2"
          style={{ color: 'var(--text)' }}
        >
          {party.title}
        </h3>

        {/* Description */}
        {party.description && (
          <p
            className="text-sm line-clamp-2 mb-3"
            style={{ color: 'var(--text-muted)' }}
          >
            {party.description}
          </p>
        )}

        {/* Members progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              👥 Участники
            </span>
            <span className="text-xs font-bold" style={{ color: isFull ? 'var(--error)' : 'var(--text)' }}>
              {filled} / {capacity}
            </span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--surface-2)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: isFull
                  ? 'var(--error)'
                  : pct >= 75
                  ? 'var(--warning)'
                  : 'linear-gradient(90deg, var(--primary), #a855f7)',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
            Создал{' '}
            <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>
              {party.creator_username}
            </span>
          </span>
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
            {new Date(party.created_at).toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function PartySkeleton() {
  return (
    <div
      className="rounded-2xl overflow-hidden animate-pulse"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="h-2" style={{ background: 'var(--surface-2)' }} />
      <div className="p-5 space-y-3">
        <div className="flex gap-2">
          <div className="h-5 w-20 rounded-full" style={{ background: 'var(--surface-2)' }} />
          <div className="h-5 w-16 rounded-full" style={{ background: 'var(--surface-2)' }} />
        </div>
        <div className="h-4 w-full rounded" style={{ background: 'var(--surface-2)' }} />
        <div className="h-4 w-2/3 rounded" style={{ background: 'var(--surface-2)' }} />
        <div className="h-1.5 w-full rounded-full mt-4" style={{ background: 'var(--surface-2)' }} />
        <div className="flex justify-between mt-2">
          <div className="h-3 w-24 rounded" style={{ background: 'var(--surface-2)' }} />
          <div className="h-3 w-12 rounded" style={{ background: 'var(--surface-2)' }} />
        </div>
      </div>
    </div>
  );
}

// ─── Input style helper ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: '0.75rem',
  color: 'var(--text)',
  fontSize: '0.875rem',
  padding: '0.625rem 1rem',
  outline: 'none',
  transition: 'border-color 160ms, box-shadow 160ms',
};

function focusInput(e: React.FocusEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = 'var(--primary)';
  e.currentTarget.style.boxShadow = '0 0 0 3px var(--primary-ring)';
}
function blurInput(e: React.FocusEvent<HTMLElement>) {
  e.currentTarget.style.borderColor = 'var(--border)';
  e.currentTarget.style.boxShadow = 'none';
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PartiesSearchPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [parties, setParties]       = useState<PartyItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [total, setTotal]           = useState<number | null>(null);
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  // Filter state
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');
  const [city, setCity]               = useState('');
  const [cityInput, setCityInput]     = useState('');
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [minMembers, setMinMembers]   = useState('');
  const [maxMembers, setMaxMembers]   = useState('');
  const [sortBy, setSortBy]           = useState<'new' | 'popular' | 'date'>('new');
  const [onlyOpen, setOnlyOpen]       = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cityDebRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef  = useRef(false);

  // ── Read filters from URL on mount ─────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const q = p.get('q') || '';
    if (q) { setSearchInput(q); setSearch(q); }
    const c = p.get('city') || '';
    if (c) { setCityInput(c); setCity(c); }
    if (p.get('date_from')) setDateFrom(p.get('date_from')!);
    if (p.get('date_to'))   setDateTo(p.get('date_to')!);
    if (p.get('min_members')) setMinMembers(p.get('min_members')!);
    if (p.get('max_members')) setMaxMembers(p.get('max_members')!);
    if (p.get('sort_by') && ['new', 'popular', 'date'].includes(p.get('sort_by')!))
      setSortBy(p.get('sort_by') as 'new' | 'popular' | 'date');
    if (p.get('only_open') === 'true') setOnlyOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync filters to URL ────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams();
    if (search)     p.set('q', search);
    if (city)       p.set('city', city);
    if (dateFrom)   p.set('date_from', dateFrom);
    if (dateTo)     p.set('date_to', dateTo);
    if (minMembers) p.set('min_members', minMembers);
    if (maxMembers) p.set('max_members', maxMembers);
    if (sortBy !== 'new') p.set('sort_by', sortBy);
    if (onlyOpen)   p.set('only_open', 'true');
    const qs = p.toString();
    router.replace(qs ? `/parties?${qs}` : '/parties', { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, city, dateFrom, dateTo, minMembers, maxMembers, sortBy, onlyOpen]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = useCallback(async (
    pageNum: number,
    q: string, c: string, from: string, to: string,
    minM: string, maxM: string,
    sort: string,
    append: boolean,
  ) => {
    if (!token || loadingRef.current) return;
    loadingRef.current = true;
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        page: String(pageNum),
        per_page: String(PAGE_SIZE),
        sort_by: sort,
      });
      if (q.trim()) params.set('q', q.trim());
      if (c.trim()) params.set('city', c.trim());
      if (from)     params.set('date_from', `${from}T00:00:00`);
      if (to)       params.set('date_to', `${to}T23:59:59`);
      if (minM)     params.set('min_members', minM);
      if (maxM)     params.set('max_members', maxM);

      const res = await apiFetch(`/parties/search?${params}`);
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data: SearchResponse = await res.json();

      let items = data.items;
      if (onlyOpen) items = items.filter(p => p.is_open && p.member_count + 1 < p.max_members);

      setTotal(data.total);
      setTotalPages(data.pages);
      setParties(prev => append ? [...prev, ...items] : items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить компании');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, [token, onlyOpen]);

  // ── Refs for IntersectionObserver ─────────────────────────────────────────
  const pageRef       = useRef(page);
  const totalPagesRef = useRef(totalPages);
  const searchRef     = useRef(search);
  const cityRef       = useRef(city);
  const dateFromRef   = useRef(dateFrom);
  const dateToRef     = useRef(dateTo);
  const minMRef       = useRef(minMembers);
  const maxMRef       = useRef(maxMembers);
  const sortByRef     = useRef(sortBy);

  pageRef.current       = page;
  totalPagesRef.current = totalPages;
  searchRef.current     = search;
  cityRef.current       = city;
  dateFromRef.current   = dateFrom;
  dateToRef.current     = dateTo;
  minMRef.current       = minMembers;
  maxMRef.current       = maxMembers;
  sortByRef.current     = sortBy;

  // ── Reset on filter change ────────────────────────────────────────────────
  useEffect(() => {
    setPage(1);
    load(1, search, city, dateFrom, dateTo, minMembers, maxMembers, sortBy, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, city, dateFrom, dateTo, minMembers, maxMembers, sortBy, onlyOpen, load]);

  // ── Infinite scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      entries => {
        if (
          entries[0].isIntersecting &&
          pageRef.current < totalPagesRef.current &&
          !loadingRef.current
        ) {
          const next = pageRef.current + 1;
          setPage(next);
          load(
            next,
            searchRef.current, cityRef.current,
            dateFromRef.current, dateToRef.current,
            minMRef.current, maxMRef.current,
            sortByRef.current, true,
          );
        }
      },
      { rootMargin: '0px 0px 250px 0px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [load]);

  // ── Debounced handlers ────────────────────────────────────────────────────
  const onSearchChange = (val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 400);
  };

  const onCityChange = (val: string) => {
    setCityInput(val);
    if (cityDebRef.current) clearTimeout(cityDebRef.current);
    cityDebRef.current = setTimeout(() => setCity(val), 400);
  };

  const clearFilters = () => {
    setSearchInput(''); setSearch('');
    setCityInput(''); setCity('');
    setDateFrom(''); setDateTo('');
    setMinMembers(''); setMaxMembers('');
    setSortBy('new');
    setOnlyOpen(false);
  };

  const hasActive = !!(search || city || dateFrom || dateTo || minMembers || maxMembers || sortBy !== 'new' || onlyOpen);

  // ── Active filter chips ───────────────────────────────────────────────────
  const chips: { label: string; clear: () => void }[] = [];
  if (search)     chips.push({ label: `«${search}»`, clear: () => { setSearchInput(''); setSearch(''); } });
  if (city)       chips.push({ label: `📍 ${city}`, clear: () => { setCityInput(''); setCity(''); } });
  if (dateFrom)   chips.push({ label: `с ${new Date(dateFrom).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`, clear: () => setDateFrom('') });
  if (dateTo)     chips.push({ label: `по ${new Date(dateTo).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`, clear: () => setDateTo('') });
  if (minMembers) chips.push({ label: `мин. ${minMembers} чел.`, clear: () => setMinMembers('') });
  if (maxMembers) chips.push({ label: `макс. ${maxMembers} чел.`, clear: () => setMaxMembers('') });
  if (onlyOpen)   chips.push({ label: '✅ Только открытые', clear: () => setOnlyOpen(false) });

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--divider)' }}>
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-black" style={{ color: 'var(--text)' }}>
                Найти компанию
              </h1>
              {total !== null && !loading && (
                <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                  {total.toLocaleString('ru-RU')} компаний
                </p>
              )}
            </div>
            <button
              onClick={() => setShowFilters(v => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition"
              style={{
                background: showFilters ? 'var(--primary)' : 'var(--surface-2)',
                color: showFilters ? 'var(--text-inverse)' : 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 3H2l8 9.46V19l4 2v-8.54z" />
              </svg>
              Фильтры
              {hasActive && (
                <span
                  className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center"
                  style={{ background: showFilters ? 'rgba(255,255,255,0.3)' : 'var(--primary)', color: showFilters ? '#fff' : 'var(--text-inverse)' }}
                >
                  {chips.length}
                </span>
              )}
            </button>
          </div>

          {/* ── Search bar (always visible) ─────────────────────────────── */}
          <div className="mt-5 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: 'var(--text-faint)' }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={e => onSearchChange(e.target.value)}
                placeholder="Поиск по названию или описанию..."
                style={{ ...inputStyle, paddingLeft: '2.25rem', width: '100%' }}
                onFocus={focusInput}
                onBlur={blurInput}
              />
            </div>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as 'new' | 'popular' | 'date')}
              style={inputStyle}
              onFocus={focusInput}
              onBlur={blurInput}
            >
              <option value="new">Сначала новые</option>
              <option value="popular">По популярности</option>
              <option value="date">По дате создания</option>
            </select>

            {/* Only open toggle */}
            <button
              onClick={() => setOnlyOpen(v => !v)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition"
              style={{
                background: onlyOpen ? 'var(--success)' : 'var(--surface-2)',
                color: onlyOpen ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              ✅ Открытые
            </button>

            {hasActive && (
              <button
                onClick={clearFilters}
                className="px-4 py-2.5 rounded-xl text-sm transition"
                style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                Сбросить ×
              </button>
            )}
          </div>

          {/* ── Extended filters panel ──────────────────────────────────── */}
          {showFilters && (
            <div
              className="mt-4 p-4 rounded-2xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
              }}
            >
              {/* City */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-faint)' }}>
                  📍 Город
                </label>
                <input
                  type="text"
                  value={cityInput}
                  onChange={e => onCityChange(e.target.value)}
                  placeholder="Москва, Казань..."
                  style={{ ...inputStyle, width: '100%' }}
                  onFocus={focusInput}
                  onBlur={blurInput}
                />
              </div>

              {/* Date from */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-faint)' }}>
                  📅 Создана после
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => {
                    setDateFrom(e.target.value);
                    if (dateTo && e.target.value > dateTo) setDateTo(e.target.value);
                  }}
                  style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
                  onFocus={focusInput}
                  onBlur={blurInput}
                />
              </div>

              {/* Date to */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-faint)' }}>
                  📅 Создана до
                </label>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom}
                  onChange={e => setDateTo(e.target.value)}
                  style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
                  onFocus={focusInput}
                  onBlur={blurInput}
                />
              </div>

              {/* Members range */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold" style={{ color: 'var(--text-faint)' }}>
                  👥 Размер компании
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={minMembers}
                    onChange={e => setMinMembers(e.target.value)}
                    placeholder="от"
                    min={1}
                    style={{ ...inputStyle, width: '100%' }}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                  <span style={{ color: 'var(--text-faint)' }}>—</span>
                  <input
                    type="number"
                    value={maxMembers}
                    onChange={e => setMaxMembers(e.target.value)}
                    placeholder="до"
                    min={1}
                    style={{ ...inputStyle, width: '100%' }}
                    onFocus={focusInput}
                    onBlur={blurInput}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Active filter chips ──────────────────────────────────────── */}
          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((chip, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                  style={{
                    background: 'var(--primary-hl)',
                    border: '1px solid var(--border)',
                    color: 'var(--primary)',
                  }}
                >
                  {chip.label}
                  <button
                    onClick={chip.clear}
                    className="transition hover:opacity-70"
                    style={{ color: 'var(--primary)' }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main className="container mx-auto px-4 py-8">

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => <PartySkeleton key={i} />)}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center py-24 gap-4">
            <span className="text-5xl">😕</span>
            <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
              Не удалось загрузить компании
            </p>
            <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
            <button
              onClick={() => load(1, search, city, dateFrom, dateTo, minMembers, maxMembers, sortBy, false)}
              className="gv-btn-primary"
            >
              Попробовать снова
            </button>
          </div>
        )}

        {/* Results */}
        {!loading && !error && (
          <>
            {parties.length === 0 ? (
              <div className="flex flex-col items-center py-24 gap-4 text-center">
                <span className="text-6xl">👥</span>
                <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>
                  Компании не найдены
                </p>
                <p className="text-sm max-w-xs" style={{ color: 'var(--text-muted)' }}>
                  Попробуйте изменить фильтры или поискать по другому названию
                </p>
                {hasActive && (
                  <button
                    onClick={clearFilters}
                    className="mt-2 text-sm font-semibold transition"
                    style={{ color: 'var(--primary)' }}
                  >
                    Сбросить все фильтры
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                {parties.map(p => <PartyCard key={p.id} party={p} />)}
              </div>
            )}

            {/* Infinite scroll sentinel */}
            {page < totalPages && (
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
              </div>
            )}

            {/* End of results */}
            {parties.length > 0 && page >= totalPages && totalPages > 1 && (
              <div className="mt-10 flex flex-col items-center gap-2" style={{ color: 'var(--text-faint)' }}>
                <div className="w-12 h-px" style={{ background: 'var(--divider)' }} />
                <p className="text-xs">Все компании загружены · {total?.toLocaleString('ru-RU')} всего</p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
