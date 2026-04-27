'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

import Navbar from '../components/Navbar';
import EventsMap from '../components/EventsMap';
import { KudaGoEvent } from '../components/EventCard';
import EventDetailDrawer from './EventDetailDrawer';
import DateStrip from './DateStrip';
import MasonryEventCard from './MasonryEventCard';
import FeaturedCard from './FeaturedCard';
import CategoryPills from './CategoryPills';
import CityFilter from './CityFilter';
import PriceToggle from './PriceToggle';
import AgeFilter from './AgeFilter';
import GeoFilter from './GeoFilter';
import TagPills from './TagPills';
import PlaceSearchInput from './PlaceSearchInput';
import QuickDateChips from './QuickDateChips';
import TimeOfDayFilter from './TimeOfDayFilter';
import SocialFilters from './SocialFilters';
import QualityFilters from './QualityFilters';
import TimingFilters from './TimingFilters';
import TimeRangeSlider from './TimeRangeSlider';
import WeekdayPicker from './WeekdayPicker';
import {
  buildKudaGoQuery,
  toggleCategory,
  isValidCity,
  quickDateRange,
  SORT_OPTIONS,
  KUDAGO_CITIES,
  type CitySlug,
  type PriceMode,
  type SortMode,
  type GeoPoint,
  type TimeOfDay,
  type PermanenceMode,
  type QuickDate,
} from './event-filters';
import { apiFetch } from '../lib/apiFetch';
import {
  displayDate,
  getEventCategoryBadges,
  localEndTs,
  localIsoDate,
  localStartTs,
  translateCategory,
} from './utils';
import { readViewedEventIds } from './viewed-events';

// ─── Constants ───────────────────────────────────────────────────────────────
const PAGE_SIZE = 60;

interface Category { slug: string; name: string; }

function parsePriceInput(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizePriceInputValue(value: string): string {
  if (value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n < 0 ? '0' : value;
}

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [total, setTotal]         = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  // Filters
  const [city, setCity]               = useState<CitySlug>('kzn');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [priceMode, setPriceMode]     = useState<PriceMode>('all');
  const [minPrice, setMinPrice]       = useState('');
  const [maxPrice, setMaxPrice]       = useState('');
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [sortBy, setSortBy]           = useState<SortMode>('date');
  const [maxAge, setMaxAge]           = useState<number | null>(null);
  const [tags, setTags]               = useState<string[]>([]);
  const [placeSearchInput, setPlaceSearchInput] = useState('');
  const [placeSearch, setPlaceSearch] = useState('');
  const [geo, setGeo]                 = useState<GeoPoint | null>(null);
  const [quickDate, setQuickDate]     = useState<QuickDate | null>(null);
  const [timeOfDay, setTimeOfDay]     = useState<TimeOfDay | null>(null);
  const [permanence, setPermanence]   = useState<PermanenceMode>('all');
  const [hasCover, setHasCover]       = useState(false);
  const [hasParty, setHasParty]       = useState(false);
  const [hasFreeSpots, setHasFreeSpots] = useState(false);
  const [minAttendees, setMinAttendees] = useState<number | null>(null);
  const [startingWithinHours, setStartingWithinHours] = useState<number | null>(null);
  const [durationMode, setDurationMode] = useState<'short' | 'long' | null>(null);
  const [hasSchedules, setHasSchedules]   = useState(false);
  const [onlyVerifiedPlace, setOnlyVerifiedPlace] = useState(false);
  const [fromHour, setFromHour] = useState<number | null>(null);
  const [toHour,   setToHour]   = useState<number | null>(null);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [hideStarted, setHideStarted] = useState(false);
  const [hideViewed, setHideViewed] = useState(false);
  const [viewedEventIds, setViewedEventIds] = useState<Set<string>>(() => new Set());

  // Calendar & drawer state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<KudaGoEvent | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [attendeeCounts, setAttendeeCounts] = useState<Record<string, number>>({});

  const [todayStr, setTodayStr] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef  = useRef(false);
  const hasLoadedOnceRef = useRef(false);
  const router = useRouter();

  const refreshViewedEventIds = useCallback(() => {
    setViewedEventIds(new Set(readViewedEventIds()));
  }, []);

  // SSR-safe today
  useEffect(() => {
    setTodayStr(localIsoDate(new Date()));
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    refreshViewedEventIds();

    const handleFocus = () => refreshViewedEventIds();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshViewedEventIds();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshViewedEventIds]);
  useEffect(() => {
    if (!filterDrawerOpen || typeof window === 'undefined') return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterDrawerOpen(false);
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

  // Read initial filters from URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    const cityParam = p.get('city');
    if (cityParam && isValidCity(cityParam)) setCity(cityParam);
    const q = p.get('search') || '';
    if (q) { setSearchInput(q); setSearch(q); }
    const cats = p.get('categories');
    if (cats) setSelectedCats(cats.split(',').filter(Boolean));
    const priceParam = p.get('price');
    if (priceParam === 'free' || priceParam === 'paid') setPriceMode(priceParam);
    const minPriceParam = p.get('min_price');
    if (minPriceParam !== null && parsePriceInput(minPriceParam) !== null) setMinPrice(minPriceParam);
    const maxPriceParam = p.get('max_price');
    if (maxPriceParam !== null && parsePriceInput(maxPriceParam) !== null) setMaxPrice(maxPriceParam);
    if (p.get('date_from')) setDateFrom(p.get('date_from')!);
    if (p.get('date_to'))   setDateTo(p.get('date_to')!);
    if (p.get('sort_by') === 'popularity') setSortBy('popularity');
    const ma = p.get('max_age');
    if (ma !== null && ma !== '') setMaxAge(parseInt(ma, 10));
    const tagsParam = p.get('tags');
    if (tagsParam) setTags(tagsParam.split(',').filter(Boolean));
    const ps = p.get('place_search');
    if (ps) { setPlaceSearchInput(ps); setPlaceSearch(ps); }
    const lat = p.get('lat'), lon = p.get('lon'), rad = p.get('radius_m');
    if (lat && lon && rad) setGeo({ lat: parseFloat(lat), lon: parseFloat(lon), radiusM: parseInt(rad, 10) });
    if (p.get('hide_viewed') === '1') setHideViewed(true);
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
    if (city !== 'kzn') p.set('city', city);
    if (search)   p.set('search',     search);
    if (selectedCats.length) p.set('categories', selectedCats.join(','));
    if (priceMode !== 'all') p.set('price', priceMode);
    const minPriceValue = parsePriceInput(minPrice);
    const maxPriceValue = parsePriceInput(maxPrice);
    if (minPriceValue !== null && maxPriceValue !== null) {
      p.set('min_price', String(Math.min(minPriceValue, maxPriceValue)));
      p.set('max_price', String(Math.max(minPriceValue, maxPriceValue)));
    } else {
      if (minPriceValue !== null) p.set('min_price', String(minPriceValue));
      if (maxPriceValue !== null) p.set('max_price', String(maxPriceValue));
    }
    if (dateFrom) p.set('date_from',  dateFrom);
    if (dateTo)   p.set('date_to',    dateTo);
    if (sortBy !== 'date') p.set('sort_by', sortBy);
    if (maxAge !== null) p.set('max_age', String(maxAge));
    if (tags.length) p.set('tags', tags.join(','));
    if (placeSearch) p.set('place_search', placeSearch);
    if (geo) {
      p.set('lat', String(geo.lat));
      p.set('lon', String(geo.lon));
      p.set('radius_m', String(geo.radiusM));
    }
    if (hideViewed) p.set('hide_viewed', '1');
    const qs = p.toString();
    router.replace(qs ? `/events?${qs}` : '/events', { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, search, selectedCats, priceMode, minPrice, maxPrice, dateFrom, dateTo, sortBy, maxAge, tags, placeSearch, geo, hideViewed]);

  // Load events from API
  const load = useCallback(async (
    loc: CitySlug, s: string, cats: string[], price: PriceMode, minP: string, maxP: string, from: string, to: string,
    age: number | null, ts: string[], ps: string, gp: GeoPoint | null, sort: SortMode,
    qd: QuickDate | null, tod: TimeOfDay | null, perm: PermanenceMode,
    hc: boolean, hp: boolean, hfs: boolean, mna: number | null,
    swh: number | null, dm: 'short' | 'long' | null, hs: boolean, ovp: boolean,
    fh: number | null, th: number | null,
    wds: number[], hst: boolean,
  ) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    const showInitialLoader = !hasLoadedOnceRef.current;
    if (showInitialLoader) setLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      // Quick-date preset overrides manual date range.
      let sinceTs: number | undefined = from ? localStartTs(from) : undefined;
      let untilTs: number | undefined = to   ? localEndTs(to)     : undefined;
      if (qd) {
        const r = quickDateRange(qd);
        sinceTs = r.since;
        untilTs = r.until;
      }

      const qs = buildKudaGoQuery({
        location: loc,
        search: s,
        categories: cats,
        priceMode: price,
        minPrice: parsePriceInput(minP),
        maxPrice: parsePriceInput(maxP),
        actualSince: sinceTs,
        actualUntil: untilTs,
        maxAge: age,
        tags: ts,
        placeSearch: ps,
        geo: gp,
        sort,
        timeOfDay: tod,
        permanence: perm,
        hasCover: hc,
        hasParty: hp,
        hasFreeSpots: hfs,
        minAttendees: mna,
        startingWithinHours: swh,
        durationMode: dm,
        hasSchedules: hs,
        onlyVerifiedPlace: ovp,
        fromHour: fh,
        toHour: th,
        weekdays: wds,
        hideStarted: hst,
        page: 1,
        pageSize: PAGE_SIZE,
      });

      const res = await apiFetch(`/kudago/events?${qs}`);
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data = await res.json();
      const incoming: KudaGoEvent[] = data.results || [];
      setTotal(data.count ?? null);
      setEvents(incoming);
      hasLoadedOnceRef.current = true;

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
      setIsRefreshing(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    loadingRef.current = false;
    load(
      city, search, selectedCats, priceMode, minPrice, maxPrice, dateFrom, dateTo,
      maxAge, tags, placeSearch, geo, sortBy,
      quickDate, timeOfDay, permanence, hasCover, hasParty, hasFreeSpots, minAttendees,
      startingWithinHours, durationMode, hasSchedules, onlyVerifiedPlace,
      fromHour, toHour,
      weekdays, hideStarted,
    );
  }, [
    city, search, selectedCats, priceMode, minPrice, maxPrice, dateFrom, dateTo,
    maxAge, tags, placeSearch, geo, sortBy,
    quickDate, timeOfDay, permanence, hasCover, hasParty, hasFreeSpots, minAttendees,
    startingWithinHours, durationMode, hasSchedules, onlyVerifiedPlace,
    fromHour, toHour, weekdays, hideStarted,
    load,
  ]);

  // Debounced place search
  const onPlaceSearchChange = useCallback((v: string) => {
    setPlaceSearchInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v.trim()) setPlaceSearch('');
    else debounceRef.current = setTimeout(() => setPlaceSearch(v.trim()), 500);
  }, []);

  // Debounced search
  const onSearchChange = useCallback((val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setSearch('');
    } else {
      debounceRef.current = setTimeout(() => setSearch(val), 500);
    }
  }, []);

  const addCategoryFilter = useCallback((slug: string) => {
    setSelectedCats(current => (
      current.includes(slug) ? current : toggleCategory(current, slug)
    ));
  }, []);

  const clearFilters = useCallback(() => {
    setSearchInput(''); setSearch(''); setSelectedCats([]);
    setPriceMode('all'); setMinPrice(''); setMaxPrice(''); setDateFrom(''); setDateTo('');
    setSortBy('date'); setSelectedDate(null);
    setMaxAge(null); setTags([]);
    setPlaceSearchInput(''); setPlaceSearch(''); setGeo(null);
    setQuickDate(null); setTimeOfDay(null); setPermanence('all');
    setHasCover(false); setHasParty(false); setHasFreeSpots(false); setMinAttendees(null);
    setStartingWithinHours(null); setDurationMode(null);
    setHasSchedules(false); setOnlyVerifiedPlace(false);
    setFromHour(null); setToHour(null);
    setWeekdays([]); setHideStarted(false); setHideViewed(false);
  }, []);

  const hasActive = !!(
    search || selectedCats.length || priceMode !== 'all' || minPrice || maxPrice || dateFrom || dateTo ||
    sortBy !== 'date' || maxAge !== null || tags.length || placeSearch || geo ||
    quickDate || timeOfDay || permanence !== 'all' ||
    hasCover || hasParty || hasFreeSpots || minAttendees ||
    startingWithinHours || durationMode || hasSchedules || onlyVerifiedPlace ||
    fromHour !== null || toHour !== null ||
    weekdays.length > 0 || hideStarted || hideViewed
  );
  const activeFilterCount = useMemo(() => {
    return [
      city !== 'kzn',
      selectedCats.length > 0,
      priceMode !== 'all',
      !!minPrice,
      !!maxPrice,
      !!dateFrom || !!dateTo,
      sortBy !== 'date',
      maxAge !== null,
      tags.length > 0,
      !!placeSearch,
      !!geo,
      !!quickDate,
      !!timeOfDay,
      permanence !== 'all',
      hasCover,
      hasParty,
      hasFreeSpots,
      minAttendees !== null,
      startingWithinHours !== null,
      durationMode !== null,
      hasSchedules,
      onlyVerifiedPlace,
      fromHour !== null || toHour !== null,
      weekdays.length > 0,
      hideStarted,
      hideViewed,
    ].filter(Boolean).length;
  }, [
    city, selectedCats.length, priceMode, minPrice, maxPrice, dateFrom, dateTo, sortBy, maxAge,
    tags.length, placeSearch, geo, quickDate, timeOfDay, permanence, hasCover,
    hasParty, hasFreeSpots, minAttendees, startingWithinHours, durationMode,
    hasSchedules, onlyVerifiedPlace, fromHour, toHour, weekdays.length, hideStarted, hideViewed,
  ]);

  const showInitialLoading = loading && !hasLoadedOnceRef.current;

  // Backend already handles sorting via order_by; keep a noop memo for downstream code.
  const sortedEvents = events;
  const visibleEvents = useMemo(() => {
    if (!hideViewed) return sortedEvents;
    return sortedEvents.filter(event => !viewedEventIds.has(String(event.kudago_id)));
  }, [hideViewed, sortedEvents, viewedEventIds]);

  const categoryFilterOptions = useMemo(() => {
    const bySlug = new Map<string, Category>();

    categories.forEach(category => {
      if (category.slug) bySlug.set(category.slug, category);
    });

    visibleEvents.forEach(event => {
      getEventCategoryBadges(event.categories, Number.MAX_SAFE_INTEGER).forEach(category => {
        if (!bySlug.has(category.slug)) {
          bySlug.set(category.slug, { slug: category.slug, name: category.label });
        }
      });
    });

    selectedCats.forEach(slug => {
      if (!bySlug.has(slug)) {
        bySlug.set(slug, { slug, name: translateCategory(slug) });
      }
    });

    return Array.from(bySlug.values());
  }, [categories, visibleEvents, selectedCats]);

  // Events filtered by selected calendar date
  // Permanent events (is_permanent=true or start_date=null) always show
  const calendarEvents = useMemo(() => {
    if (!selectedDate) return visibleEvents;
    return visibleEvents.filter(e =>
      e.start_date === selectedDate ||
      e.is_permanent ||
      e.start_date === null
    );
  }, [visibleEvents, selectedDate]);

  // Set of dates that have events (for calendar dots)
  const eventDatesSet = useMemo(() => {
    const s = new Set<string>();
    visibleEvents.forEach(e => { if (e.start_date) s.add(e.start_date); });
    return s;
  }, [visibleEvents]);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar />

      <section className="events-section" style={{ borderTop: 'none' }}>

        {/* Header */}
        <div className="events-head">
          <div>
            <div className="t-label" style={{ marginBottom: 8 }}>Афиша</div>
            <h1 className="t-display">
              События в {KUDAGO_CITIES.find(c => c.slug === city)?.locative ?? ''}
            </h1>
            {total !== null && !showInitialLoading && (
              <p className="t-sm" style={{ marginTop: 8 }}>
                {total.toLocaleString('ru-RU')} мероприятий
              </p>
            )}
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
            type="button"
            onClick={() => setFilterDrawerOpen(true)}
            className="btn"
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '.65rem 1rem',
              borderRadius: 'var(--r-full)',
              background: activeFilterCount > 0 ? 'var(--primary)' : 'var(--surface)',
              color: activeFilterCount > 0 ? 'var(--text-inverse)' : 'var(--text)',
              border: `1px solid ${activeFilterCount > 0 ? 'var(--primary)' : 'var(--border)'}`,
              boxShadow: activeFilterCount > 0 ? '0 6px 18px var(--primary-ring)' : 'var(--shadow-sm)',
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
            aria-haspopup="dialog"
            aria-expanded={filterDrawerOpen}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M22 3H2l8 9.46V19l4 2v-8.54z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Фильтр
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

        {filterDrawerOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
              onClick={() => setFilterDrawerOpen(false)}
              aria-hidden="true"
            />

            <aside
              className="events-filter-drawer fixed top-0 right-0 z-50 h-full overflow-y-auto flex flex-col"
              style={{
                width: 460,
                maxWidth: '100vw',
                background: 'var(--surface)',
                borderLeft: '1px solid var(--border)',
                boxShadow: 'var(--shadow-lg)',
                animation: 'filterDrawerSlideIn 0.25s cubic-bezier(0.16,1,0.3,1) forwards',
              }}
              role="dialog"
              aria-modal="true"
              aria-label="Фильтры"
            >
              <div
                className="sticky top-0 z-10 flex items-center justify-between gap-3"
                style={{
                  padding: '1rem 1.25rem',
                  background: 'var(--surface)',
                  borderBottom: '1px solid var(--divider)',
                }}
              >
                <div>
                  <h2 className="text-xl font-black" style={{ color: 'var(--text)' }}>Фильтры</h2>
                  {activeFilterCount > 0 && (
                    <p className="t-xs" style={{ marginTop: 2, color: 'var(--text-muted)' }}>
                      Активно: {activeFilterCount}
                    </p>
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
                  aria-label="Закрыть фильтры"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col gap-5" style={{ padding: '1.25rem' }}>
                <section className="flex flex-col gap-3">
                  <h3 className="t-label">Основное</h3>
                  <CityFilter value={city} onChange={setCity} />
                  <PriceToggle value={priceMode} onChange={setPriceMode} />
                  <div className="flex flex-col gap-2">
                    <span className="t-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Цена</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={minPrice}
                        onChange={e => setMinPrice(normalizePriceInputValue(e.target.value))}
                        placeholder="от"
                        aria-label="Цена от"
                        className="input"
                        style={{ width: '100%', padding: '.65rem 1rem', fontSize: '.875rem' }}
                      />
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={maxPrice}
                        onChange={e => setMaxPrice(normalizePriceInputValue(e.target.value))}
                        placeholder="до"
                        aria-label="Цена до"
                        className="input"
                        style={{ width: '100%', padding: '.65rem 1rem', fontSize: '.875rem' }}
                      />
                    </div>
                  </div>
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as SortMode)}
                    className="input"
                    style={{ width: '100%', padding: '.65rem 1rem', fontSize: '.875rem' }}
                    aria-label="Сортировка"
                  >
                    {SORT_OPTIONS.map(o => (
                      <option
                        key={o.value}
                        value={o.value}
                        disabled={o.value === 'nearest' && !geo}
                      >
                        {o.label}{o.value === 'nearest' && !geo ? ' (нужна геолокация)' : ''}
                      </option>
                    ))}
                  </select>
                  <label
                    className="flex items-center justify-between gap-3"
                    style={{
                      padding: '0.75rem 0.9rem',
                      borderRadius: 'var(--r-xl)',
                      background: 'var(--surface-2)',
                      border: `1px solid ${hideViewed ? 'var(--primary)' : 'var(--border)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      Убрать просмотренные
                    </span>
                    <input
                      type="checkbox"
                      checked={hideViewed}
                      onChange={e => setHideViewed(e.target.checked)}
                      aria-label="Убрать просмотренные события"
                      style={{
                        width: 18,
                        height: 18,
                        accentColor: 'var(--primary)',
                        flexShrink: 0,
                      }}
                    />
                  </label>
                </section>

                <section className="flex flex-col gap-3">
                  <h3 className="t-label">Дата и время</h3>
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
                      style={{ width: '100%', padding: '.65rem 1rem', fontSize: '.875rem' }}
                    />
                    <span className="t-xs" style={{ color: 'var(--text-dim)' }}>-</span>
                    <input
                      type="date"
                      value={dateTo}
                      min={dateFrom || todayStr}
                      suppressHydrationWarning
                      onChange={e => setDateTo(e.target.value)}
                      className="input"
                      style={{ width: '100%', padding: '.65rem 1rem', fontSize: '.875rem' }}
                    />
                  </div>

                  {(dateFrom || dateTo) && (
                    <span className="badge badge-ink" style={{ gap: 6, width: 'fit-content' }}>
                      {dateFrom && dateTo && dateFrom === dateTo
                        ? displayDate(dateFrom, { day: 'numeric', month: 'long' })
                        : [
                            dateFrom && `с ${displayDate(dateFrom, { day: 'numeric', month: 'short' })}`,
                            dateTo   && `по ${displayDate(dateTo, { day: 'numeric', month: 'short' })}`,
                          ].filter(Boolean).join(' ')}
                      <button
                        onClick={() => { setDateFrom(''); setDateTo(''); }}
                        style={{ marginLeft: 4, background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                        aria-label="Сбросить даты"
                      >x</button>
                    </span>
                  )}

                  <QuickDateChips active={quickDate} onSelect={setQuickDate} />
                  <TimeOfDayFilter value={timeOfDay} onChange={setTimeOfDay} />
                  <TimeRangeSlider from={fromHour} to={toHour} onChange={(f, t) => { setFromHour(f); setToHour(t); }} />
                  <WeekdayPicker selected={weekdays} onChange={setWeekdays} />
                  <button
                    aria-pressed={hideStarted}
                    onClick={() => setHideStarted(v => !v)}
                    style={{
                      width: 'fit-content',
                      padding: '0.4rem 0.9rem',
                      borderRadius: 'var(--r-full)',
                      fontSize: '.8125rem',
                      background: hideStarted ? 'var(--primary)' : 'var(--surface-2)',
                      color: hideStarted ? 'var(--text-inverse)' : 'var(--text-muted)',
                      border: `1px solid ${hideStarted ? 'var(--primary)' : 'var(--border)'}`,
                      cursor: 'pointer',
                      fontWeight: 600,
                      boxShadow: hideStarted ? '0 2px 8px var(--primary-ring)' : 'none',
                    }}
                  >
                    Еще не начались
                  </button>
                </section>

                <section className="flex flex-col gap-3">
                  <h3 className="t-label">Место и возраст</h3>
                  <AgeFilter value={maxAge} onChange={setMaxAge} />
                  <PlaceSearchInput value={placeSearchInput} onChange={onPlaceSearchChange} />
                  <GeoFilter value={geo} onChange={setGeo} />
                </section>

                <section className="flex flex-col gap-3">
                  <h3 className="t-label">Социальные и качество</h3>
                  <SocialFilters
                    hasParty={hasParty}
                    hasFreeSpots={hasFreeSpots}
                    minAttendees={minAttendees}
                    onChange={(patch) => {
                      if (patch.hasParty !== undefined) setHasParty(patch.hasParty);
                      if (patch.hasFreeSpots !== undefined) setHasFreeSpots(patch.hasFreeSpots);
                      if (patch.minAttendees !== undefined) setMinAttendees(patch.minAttendees);
                    }}
                  />
                  <QualityFilters
                    permanence={permanence}
                    hasCover={hasCover}
                    onChange={(patch) => {
                      if (patch.permanence !== undefined) setPermanence(patch.permanence);
                      if (patch.hasCover !== undefined) setHasCover(patch.hasCover);
                    }}
                  />
                  <TimingFilters
                    startingWithinHours={startingWithinHours}
                    durationMode={durationMode}
                    hasSchedules={hasSchedules}
                    onlyVerifiedPlace={onlyVerifiedPlace}
                    onChange={(patch) => {
                      if (patch.startingWithinHours !== undefined) setStartingWithinHours(patch.startingWithinHours);
                      if (patch.durationMode !== undefined) setDurationMode(patch.durationMode);
                      if (patch.hasSchedules !== undefined) setHasSchedules(patch.hasSchedules);
                      if (patch.onlyVerifiedPlace !== undefined) setOnlyVerifiedPlace(patch.onlyVerifiedPlace);
                    }}
                  />
                </section>

                <section className="flex flex-col gap-3">
                  <h3 className="t-label">Теги и категории</h3>
                  <TagPills selected={tags} onChange={setTags} />
                  {categoryFilterOptions.length > 0 && (
                    <div style={{ overflow: 'hidden' }}>
                      <CategoryPills
                        categories={categoryFilterOptions}
                        selected={selectedCats}
                        onToggle={(slug) => setSelectedCats(cur => toggleCategory(cur, slug))}
                      />
                    </div>
                  )}
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
                  <button onClick={clearFilters} className="btn btn-ghost" style={{ flex: 1 }}>
                    Сбросить
                  </button>
                )}
                <button onClick={() => setFilterDrawerOpen(false)} className="gv-btn-primary" style={{ flex: 1 }}>
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
                .events-filter-drawer {
                  width: 100vw !important;
                  border-left: none !important;
                }
              }
            `}</style>
          </>
        )}

      {/* ── Events map: synced 1:1 with the filtered list below ── */}
      {!error && (
        <EventsMap
          events={visibleEvents}
          city={city}
          onEventClick={setSelectedEvent}
        />
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
              onClick={() => load(
                city, search, selectedCats, priceMode, minPrice, maxPrice, dateFrom, dateTo,
                maxAge, tags, placeSearch, geo, sortBy,
                quickDate, timeOfDay, permanence, hasCover, hasParty, hasFreeSpots, minAttendees,
                startingWithinHours, durationMode, hasSchedules, onlyVerifiedPlace,
                fromHour, toHour,
                weekdays, hideStarted,
              )}
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
            {!error && (
              <div className="mb-8">
                <DateStrip
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  eventDates={eventDatesSet}
                />
              </div>
            )}

            {/* Skeleton */}
            {showInitialLoading && <MasonrySkeleton />}

            {/* Featured + Masonry grid */}
            {!showInitialLoading && calendarEvents.length > 0 && (
              <>
                {/* Featured card — first event */}
                <div className="mb-6">
                  <FeaturedCard
                    event={calendarEvents[0]}
                    attendeeCount={attendeeCounts[String(calendarEvents[0].kudago_id)] ?? 0}
                    isViewed={viewedEventIds.has(String(calendarEvents[0].kudago_id))}
                    onClick={setSelectedEvent}
                    onCategoryClick={addCategoryFilter}
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
                        isViewed={viewedEventIds.has(String(event.kudago_id))}
                        onClick={setSelectedEvent}
                        onCategoryClick={addCategoryFilter}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {isRefreshing && (
              <div
                aria-live="polite"
                style={{
                  position: 'sticky',
                  top: 14,
                  zIndex: 2,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0.45rem 0.75rem',
                  borderRadius: 'var(--r-full)',
                  marginBottom: 12,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  fontSize: '.8125rem',
                  fontWeight: 600,
                  pointerEvents: 'none',
                }}
              >
                <span
                  className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin"
                />
                Updating...
              </div>
            )}

            {/* Empty masonry state */}
            {!showInitialLoading && calendarEvents.length === 0 && visibleEvents.length > 0 && (
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
            {!showInitialLoading && visibleEvents.length === 0 && !error && (
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
          onViewed={refreshViewedEventIds}
        />
      )}
    </div>
  );
}
