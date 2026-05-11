'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/apiFetch';
import { capitalizeFirstDisplayChar } from '../lib/text';
import { buildEventIdentityMeta } from '../lib/event-identity';
import {
  POPULAR_PARTY_CITIES,
  buildPartiesSearchQuery,
  buildPartiesUrlQuery,
  countActivePartyFilters,
  togglePartyCity,
  type PartySortMode,
} from './parties-filters';

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
  event_title?: string | null;
  event_date_ts?: number | null;
  event_image_url?: string | null;
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
  const displayTitle = capitalizeFirstDisplayChar(party.title);
  const eventMeta = buildEventIdentityMeta({
    eventId: party.event_id,
    eventTitle: party.event_title,
    eventDateTs: party.event_date_ts,
  });

  return (
    <div
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

      <Link href={`/parties/${party.id}`} className="block p-5">
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
          {displayTitle}
        </h3>

        <div
          className="mb-3 rounded-xl px-3 py-2"
          style={{
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
            Событие
          </p>
          <p className="text-sm font-semibold line-clamp-2" style={{ color: 'var(--text)' }}>
            {eventMeta.title}
          </p>
          {eventMeta.dateLabel && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {eventMeta.dateLabel}
            </p>
          )}
        </div>

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
      </Link>

      <div className="px-5 pb-5 -mt-1">
        <Link
          href={eventMeta.href}
          className="inline-flex items-center gap-1 text-xs font-semibold"
          style={{ color: 'var(--primary)' }}
        >
          Открыть событие →
        </Link>
      </div>
    </div>
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
  const { token, isLoading: authLoading } = useAuth();
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
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [minMembers, setMinMembers]   = useState('');
  const [maxMembers, setMaxMembers]   = useState('');
  const [sortBy, setSortBy]           = useState<PartySortMode>('new');
  const [onlyOpen, setOnlyOpen]       = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef  = useRef(false);

  // ── Redirect unauthenticated users ────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !token) {
      router.replace('/login');
    }
  }, [authLoading, token, router]);

  useEffect(() => {
    if (!filterDrawerOpen || typeof window === 'undefined') return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterDrawerOpen(false);
    };
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;

    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [filterDrawerOpen]);

  // ── Read filters from URL on mount ─────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const q = p.get('q') || '';
    if (q) { setSearchInput(q); setSearch(q); }
    const cities = p.getAll('city');
    if (cities.length > 0) setSelectedCities(cities);
    if (p.get('date_from')) setDateFrom(p.get('date_from')!);
    if (p.get('date_to'))   setDateTo(p.get('date_to')!);
    if (p.get('min_members')) setMinMembers(p.get('min_members')!);
    if (p.get('max_members')) setMaxMembers(p.get('max_members')!);
    if (p.get('sort_by') && ['new', 'popular', 'date'].includes(p.get('sort_by')!))
      setSortBy(p.get('sort_by') as PartySortMode);
    if (p.get('only_open') === 'true') setOnlyOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync filters to URL ────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = buildPartiesUrlQuery({
      search,
      cities: selectedCities,
      dateFrom,
      dateTo,
      minMembers,
      maxMembers,
      sortBy,
      onlyOpen,
    });
    router.replace(qs ? `/parties?${qs}` : '/parties', { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedCities, dateFrom, dateTo, minMembers, maxMembers, sortBy, onlyOpen]);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = useCallback(async (
    pageNum: number,
    q: string, cities: string[], from: string, to: string,
    minM: string, maxM: string,
    sort: string,
    append: boolean,
  ) => {
    if (!token) { setLoading(false); setLoadingMore(false); return; }
    if (loadingRef.current) return;
    loadingRef.current = true;
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);

    try {
      const params = buildPartiesSearchQuery({
        page: pageNum,
        pageSize: PAGE_SIZE,
        search: q,
        cities,
        dateFrom: from,
        dateTo: to,
        minMembers: minM,
        maxMembers: maxM,
        sortBy: sort as PartySortMode,
        onlyOpen,
      });

      const res = await apiFetch(`/parties/search?${params}`);
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data: SearchResponse = await res.json();

      const items = data.items;

      setTotal(data.total);
      setTotalPages(data.pages);
      setParties(prev => {
        if (!append) return items;
        const merged = [...prev];
        const seen = new Set(prev.map(p => p.id));
        for (const item of items) {
          if (!seen.has(item.id)) {
            merged.push(item);
            seen.add(item.id);
          }
        }
        return merged;
      });
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
  const citiesRef     = useRef(selectedCities);
  const dateFromRef   = useRef(dateFrom);
  const dateToRef     = useRef(dateTo);
  const minMRef       = useRef(minMembers);
  const maxMRef       = useRef(maxMembers);
  const sortByRef     = useRef(sortBy);

  pageRef.current       = page;
  totalPagesRef.current = totalPages;
  searchRef.current     = search;
  citiesRef.current     = selectedCities;
  dateFromRef.current   = dateFrom;
  dateToRef.current     = dateTo;
  minMRef.current       = minMembers;
  maxMRef.current       = maxMembers;
  sortByRef.current     = sortBy;

  // ── Reset on filter change ────────────────────────────────────────────────
  useEffect(() => {
    setPage(1);
    load(1, search, selectedCities, dateFrom, dateTo, minMembers, maxMembers, sortBy, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, selectedCities, dateFrom, dateTo, minMembers, maxMembers, sortBy, onlyOpen, load]);

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
            searchRef.current, citiesRef.current,
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

  const toggleCity = (city: string) => {
    setSelectedCities(prev => togglePartyCity(prev, city));
  };

  const clearFilters = () => {
    setSearchInput(''); setSearch('');
    setSelectedCities([]);
    setDateFrom(''); setDateTo('');
    setMinMembers(''); setMaxMembers('');
    setSortBy('new');
    setOnlyOpen(false);
  };

  const activeFilterCount = countActivePartyFilters({
    search,
    cities: selectedCities,
    dateFrom,
    dateTo,
    minMembers,
    maxMembers,
    sortBy,
    onlyOpen,
  });
  const hasActive = activeFilterCount > 0;

  // ── Active filter chips ───────────────────────────────────────────────────
  const chips: { label: string; clear: () => void }[] = [];
  if (search)     chips.push({ label: `«${search}»`, clear: () => { setSearchInput(''); setSearch(''); } });
  selectedCities.forEach(city => {
    chips.push({ label: `📍 ${city}`, clear: () => setSelectedCities(prev => prev.filter(c => c !== city)) });
  });
  if (dateFrom)   chips.push({ label: `с ${new Date(dateFrom).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`, clear: () => setDateFrom('') });
  if (dateTo)     chips.push({ label: `по ${new Date(dateTo).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`, clear: () => setDateTo('') });
  if (minMembers) chips.push({ label: `мин. ${minMembers} чел.`, clear: () => setMinMembers('') });
  if (maxMembers) chips.push({ label: `макс. ${maxMembers} чел.`, clear: () => setMaxMembers('') });
  if (onlyOpen)   chips.push({ label: '✅ Только открытые', clear: () => setOnlyOpen(false) });

  // Pre-auth guard: пока auth ещё грузится или уже редиректим — ничего не рендерим
  // (иначе skeleton мелькает перед router.replace('/login'))
  if (authLoading || !token) return null;

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
              onClick={() => setFilterDrawerOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition"
              style={{
                background: activeFilterCount > 0 ? 'var(--primary)' : 'var(--surface)',
                color: activeFilterCount > 0 ? 'var(--text-inverse)' : 'var(--text)',
                border: `1px solid ${activeFilterCount > 0 ? 'var(--primary)' : 'var(--border)'}`,
                boxShadow: activeFilterCount > 0 ? '0 6px 18px var(--primary-ring)' : 'var(--shadow-sm)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 3H2l8 9.46V19l4 2v-8.54z" />
              </svg>
              Фильтры
              {activeFilterCount > 0 && (
                <span
                  className="inline-flex items-center justify-center"
                  style={{
                    minWidth: 20,
                    height: 20,
                    padding: '0 6px',
                    borderRadius: 'var(--r-full)',
                    background: 'rgba(255,255,255,0.24)',
                    color: 'inherit',
                    fontSize: 11,
                    fontWeight: 900,
                    lineHeight: 1,
                  }}
                >
                  {activeFilterCount}
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
              onChange={e => setSortBy(e.target.value as PartySortMode)}
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
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition"
              style={{
                background: onlyOpen ? 'var(--primary)' : 'var(--surface-2)',
                color: onlyOpen ? 'var(--text-inverse)' : 'var(--text-muted)',
                border: `1px solid ${onlyOpen ? 'var(--primary)' : 'var(--border)'}`,
                boxShadow: onlyOpen ? '0 2px 8px var(--primary-ring)' : 'none',
              }}
            >
              ✅ Открытые
            </button>

            {hasActive && (
              <button
                onClick={clearFilters}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold transition"
                style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                Сбросить ×
              </button>
            )}
          </div>

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

      {/* ── Filter drawer ─────────────────────────────────────────────────── */}
      {filterDrawerOpen && (
        <>
          <div
            className="fixed inset-0"
            style={{
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(2px)',
              zIndex: 1000,
            }}
            onClick={() => setFilterDrawerOpen(false)}
          />

          <aside
                className="fixed top-0 right-0 h-full overflow-y-auto flex flex-col"
                style={{
                  width: 460,
                  maxWidth: '100vw',
                  background: 'var(--surface)',
                  borderLeft: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-lg)',
                  animation: 'filterDrawerSlideIn 0.25s cubic-bezier(0.16,1,0.3,1) forwards',
                  zIndex: 1001,
                }}
              >
                <div
                  className="sticky top-0 z-10 flex items-center justify-between gap-3"
                  style={{
                    padding: '0.75rem 1rem',
                    background: 'var(--surface)',
                    borderBottom: '1px solid var(--divider)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black" style={{ color: 'var(--text)', lineHeight: 1.1 }}>Фильтры</h2>
                    {activeFilterCount > 0 && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Активно: {activeFilterCount}</span>
                    )}
                  </div>
                  <button
                    onClick={() => setFilterDrawerOpen(false)}
                    className="flex items-center justify-center w-9 h-9 rounded-full transition"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                <div className="flex flex-col gap-4" style={{ padding: '1rem' }}>
                  <section className="flex flex-col gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Город</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {POPULAR_PARTY_CITIES.map(city => (
                        <label
                          key={city}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition"
                          style={{
                            background: selectedCities.includes(city) ? 'var(--primary-hl)' : 'var(--surface-2)',
                            border: `1px solid ${selectedCities.includes(city) ? 'var(--primary)' : 'var(--border)'}`,
                            color: selectedCities.includes(city) ? 'var(--primary)' : 'var(--text-muted)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedCities.includes(city)}
                            onChange={() => toggleCity(city)}
                            style={{
                              width: 16,
                              height: 16,
                              accentColor: 'var(--primary)',
                              cursor: 'pointer',
                            }}
                          />
                          <span className="text-sm font-semibold">{city}</span>
                        </label>
                      ))}
                    </div>
                  </section>

                  <div style={{ borderTop: '1px solid var(--divider)' }} />

                  <section className="flex flex-col gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Дата создания</h3>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                      <span style={{ color: 'var(--text-faint)' }}>—</span>
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
                  </section>

                  <div style={{ borderTop: '1px solid var(--divider)' }} />

                  <section className="flex flex-col gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Размер компании</h3>
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
                  </section>

                  <div style={{ borderTop: '1px solid var(--divider)' }} />

                  <section className="flex flex-col gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Сортировка</h3>
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value as PartySortMode)}
                      style={inputStyle}
                      onFocus={focusInput}
                      onBlur={blurInput}
                    >
                      <option value="new">Сначала новые</option>
                      <option value="popular">По популярности</option>
                      <option value="date">По дате создания</option>
                    </select>
                  </section>

                  <div style={{ borderTop: '1px solid var(--divider)' }} />

                  <section className="flex flex-col gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>Статус</h3>
                    <button
                      onClick={() => setOnlyOpen(v => !v)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition"
                      style={{
                        background: onlyOpen ? 'var(--primary)' : 'var(--surface-2)',
                        color: onlyOpen ? 'var(--text-inverse)' : 'var(--text-muted)',
                        border: `1px solid ${onlyOpen ? 'var(--primary)' : 'var(--border)'}`,
                        boxShadow: onlyOpen ? '0 2px 8px var(--primary-ring)' : 'none',
                      }}
                    >
                      ✅ Только открытые
                    </button>
                  </section>
                </div>

                <div
                  className="sticky bottom-0 flex gap-3"
                  style={{
                    padding: '1rem 1.25rem',
                    background: 'var(--surface)',
                    borderTop: '1px solid var(--divider)',
                  }}
                >
                  {hasActive && (
                    <button onClick={clearFilters} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      Сбросить
                    </button>
                  )}
                  <button onClick={() => setFilterDrawerOpen(false)} className="gv-btn-primary flex-1">
                    Применить
                  </button>
                </div>
              </aside>

              <style>{`
                @keyframes filterDrawerSlideIn {
                  from { transform: translateX(100%); opacity: 0.6; }
                  to   { transform: translateX(0);    opacity: 1; }
                }

                @media (max-width: 640px) {
                  aside {
                    width: 100vw !important;
                    border-left: none !important;
                  }
                }
              `}</style>
            </>
          )}

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
              onClick={() => load(1, search, selectedCities, dateFrom, dateTo, minMembers, maxMembers, sortBy, false)}
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
                <button
                  type="button"
                  onClick={() => {
                    if (loadingRef.current || page >= totalPages) return;
                    const next = page + 1;
                    setPage(next);
                    load(
                      next,
                      search,
                      selectedCities,
                      dateFrom,
                      dateTo,
                      minMembers,
                      maxMembers,
                      sortBy,
                      true,
                    );
                  }}
                  disabled={loadingMore}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition"
                  style={{
                    background: 'var(--surface-2)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    opacity: loadingMore ? 0.7 : 1,
                  }}
                >
                  {loadingMore ? 'Загружаем...' : 'Загрузить ещё компании'}
                </button>
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

          </>
        )}
      </main>
    </div>
  );
}
