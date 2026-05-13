'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

import Navbar from '../components/Navbar';
import EventsMap from '../components/EventsMap';
import DatePicker from '../components/DatePicker';
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
import QuickDateChips from './QuickDateChips';
import TimeOfDayFilter from './TimeOfDayFilter';
import QualityFilters from './QualityFilters';
import TimingFilters from './TimingFilters';
import TimeRangeSlider from './TimeRangeSlider';
import {
  buildKudaGoQuery,
  toggleCategory,
  isValidCity,
  quickDateInputRange,
  cityNameToSlug,
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
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/apiFetch';
import { hasMoreEvents, mergeEventPages } from './events-pagination';
import {
  displayDate,
  getEventCategoryBadges,
  localEndTs,
  localIsoDate,
  localStartTs,
  translateCategory,
} from './utils';
import { readViewedEventIds } from './viewed-events';
import { eventDetailHref, pickRandomEvent } from './random-event';
import { FILTER_DRAWER_Z_INDEX, FILTER_OVERLAY_Z_INDEX } from './map-layering';
import { resolveApiBase } from '../lib/apiBase';

// ─── Constants ───────────────────────────────────────────────────────────────
const PAGE_SIZE = 60;
const DIRECT_BACKEND_BASE =
  (process.env.NEXT_PUBLIC_DIRECT_API_URL && process.env.NEXT_PUBLIC_DIRECT_API_URL.trim()) ||
  resolveApiBase();
const STORAGE_CITY_KEY = 'events_city';

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
  const { user } = useAuth();
  const [events, setEvents]       = useState<KudaGoEvent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [total, setTotal]         = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  // Filters
  const [city, setCity]               = useState<CitySlug>('msk');
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
  const [geo, setGeo]                 = useState<GeoPoint | null>(null);
  const [quickDate, setQuickDate]     = useState<QuickDate | null>(null);
  const [timeOfDay, setTimeOfDay]     = useState<TimeOfDay | null>(null);
  const [permanence, setPermanence]   = useState<PermanenceMode>('all');
  const [onlyVerifiedPlace, setOnlyVerifiedPlace] = useState(false);
  const [fromHour, setFromHour] = useState<number | null>(null);
  const [toHour,   setToHour]   = useState<number | null>(null);
  const [hideStarted, setHideStarted] = useState(false);
  const [hideViewed, setHideViewed] = useState(false);
  const [viewedEventIds, setViewedEventIds] = useState<Set<string>>(() => new Set());

  // Calendar & drawer state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<KudaGoEvent | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [attendeeCounts, setAttendeeCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [mapEvents, setMapEvents] = useState<KudaGoEvent[]>([]);

  const [todayStr, setTodayStr] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef  = useRef(false);
  const requestSeqRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const router = useRouter();

  // Sort dropdown refs
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const sortCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        if (sortCheckboxRef.current) {
          sortCheckboxRef.current.checked = false;
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

    // Determine initial city with priority: URL → localStorage → user profile → Moscow
    const cityParam = p.get('city');
    if (cityParam && isValidCity(cityParam)) {
      setCity(cityParam);
    } else {
      // Try localStorage
      const storedCity = localStorage.getItem(STORAGE_CITY_KEY);
      if (storedCity && isValidCity(storedCity)) {
        setCity(storedCity);
      } else {
        // Try user profile city
        const profileCitySlug = cityNameToSlug(user?.city);
        if (profileCitySlug) {
          setCity(profileCitySlug);
        }
        // Otherwise keep default 'msk'
      }
    }

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
    if (city !== 'msk') p.set('city', city);
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
    if (geo) {
      p.set('lat', String(geo.lat));
      p.set('lon', String(geo.lon));
      p.set('radius_m', String(geo.radiusM));
    }
    if (hideViewed) p.set('hide_viewed', '1');
    const qs = p.toString();
    router.replace(qs ? `/events?${qs}` : '/events', { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, search, selectedCats, priceMode, minPrice, maxPrice, dateFrom, dateTo, sortBy, maxAge, tags, geo, hideViewed]);

  // Save city to localStorage when it changes (user manually selected)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_CITY_KEY, city);
  }, [city]);

  // When user loads after initial render, try to use their profile city
  // (only if city is still default and no URL param/localStorage override)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!user) return; // User not loaded yet or not logged in

    const p = new URLSearchParams(window.location.search);
    const cityParam = p.get('city');
    const storedCity = localStorage.getItem(STORAGE_CITY_KEY);

    // Only apply profile city if no explicit override exists
    if (!cityParam && !storedCity) {
      const profileCitySlug = cityNameToSlug(user.city);
      if (profileCitySlug) {
        setCity(profileCitySlug);
      }
    }
  }, [user]);

  // When user's profile city changes, update the events page city
  // (only if no explicit URL param or localStorage override)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!user) return; // User not loaded yet or not logged in

    const p = new URLSearchParams(window.location.search);
    const cityParam = p.get('city');
    const storedCity = localStorage.getItem(STORAGE_CITY_KEY);

    // Only apply profile city change if no explicit override exists
    if (!cityParam && !storedCity) {
      const profileCitySlug = cityNameToSlug(user.city);
      if (profileCitySlug && profileCitySlug !== city) {
        setCity(profileCitySlug);
      }
    }
  }, [user?.city, city]);

  // Load events from API
  const load = useCallback(async (
    loc: CitySlug, s: string, cats: string[], price: PriceMode, minP: string, maxP: string, from: string, to: string,
    age: number | null, ts: string[], gp: GeoPoint | null, sort: SortMode,
    tod: TimeOfDay | null, perm: PermanenceMode,
    ovp: boolean,
    fh: number | null, th: number | null,
    hst: boolean,
    pageNum: number,
    append: boolean,
  ) => {
    const reqSeq = ++requestSeqRef.current;
    loadingRef.current = true;
    const showInitialLoader = !hasLoadedOnceRef.current && !append;
    if (append) setIsLoadingMore(true);
    else if (showInitialLoader) setLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      let sinceTs: number | undefined = from ? localStartTs(from) : undefined;
      let untilTs: number | undefined = to   ? localEndTs(to)     : undefined;

      const buildQuery = (queryPage: number, queryPageSize: number) => buildKudaGoQuery({
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
        geo: gp,
        sort,
        timeOfDay: tod,
        permanence: perm,
        onlyVerifiedPlace: ovp,
        fromHour: fh,
        toHour: th,
        hideStarted: hst,
        page: queryPage,
        pageSize: queryPageSize,
      });
      const qs = buildQuery(pageNum, PAGE_SIZE);

      // Important: go directly to backend for event feed.
      // Next.js rewrite proxy (/api -> backend) can intermittently reset long msk responses (ECONNRESET),
      // causing false 500 while backend itself returns data.
      const res = await apiFetch(`${DIRECT_BACKEND_BASE}/kudago/events?${qs}`);
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data = await res.json();
      if (reqSeq !== requestSeqRef.current) return;
      const incoming: KudaGoEvent[] = data.results || [];
      setTotal(data.count ?? null);
      setEvents((prev) => append ? mergeEventPages(prev, incoming) : incoming);
      setMapEvents((prev) => append ? mergeEventPages(prev, incoming) : incoming);
      setPage(pageNum);
      hasLoadedOnceRef.current = true;

      if (!append) {
        const totalCount = typeof data.count === 'number' ? data.count : null;
        if (totalCount !== null && totalCount > incoming.length) {
          const mapPageSize = 100;
          const totalPages = Math.ceil(totalCount / mapPageSize);
          let allMapEvents = incoming;
          for (let p = 1; p <= totalPages; p += 1) {
            if (p === 1) {
              if (incoming.length !== mapPageSize) {
                const resPage1 = await apiFetch(`${DIRECT_BACKEND_BASE}/kudago/events?${buildQuery(1, mapPageSize)}`);
                if (reqSeq !== requestSeqRef.current) return;
                if (!resPage1.ok) break;
                const page1Data = await resPage1.json();
                if (reqSeq !== requestSeqRef.current) return;
                const page1Events: KudaGoEvent[] = page1Data.results || [];
                allMapEvents = mergeEventPages([], page1Events);
                setMapEvents(allMapEvents);
              }
              continue;
            }
            const resNext = await apiFetch(`${DIRECT_BACKEND_BASE}/kudago/events?${buildQuery(p, mapPageSize)}`);
            if (reqSeq !== requestSeqRef.current) return;
            if (!resNext.ok) break;
            const nextData = await resNext.json();
            if (reqSeq !== requestSeqRef.current) return;
            const nextEvents: KudaGoEvent[] = nextData.results || [];
            allMapEvents = mergeEventPages(allMapEvents, nextEvents);
            setMapEvents(allMapEvents);
            if (nextEvents.length === 0) break;
          }
        }
      }

      // Fetch attendee counts in background
      if (incoming.length > 0) {
        const ids = incoming.map(e => String(e.kudago_id)).join(',');
        apiFetch(`${DIRECT_BACKEND_BASE}/attendees/batch-counts?ids=${ids}`)
          .then(r => r.ok ? r.json() : {})
          .then((counts: Record<string, number>) => {
            setAttendeeCounts((prev) => append ? { ...prev, ...counts } : counts);
          })
          .catch(() => {});
      }
    } catch (e: unknown) {
      if (reqSeq !== requestSeqRef.current) return;
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      if (reqSeq !== requestSeqRef.current) return;
      setLoading(false);
      setIsRefreshing(false);
      setIsLoadingMore(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    load(
      city, search, selectedCats, priceMode, minPrice, maxPrice, dateFrom, dateTo,
      maxAge, tags, geo, sortBy,
      timeOfDay, permanence, onlyVerifiedPlace,
      fromHour, toHour,
      hideStarted,
      1, false,
    );
  }, [
    city, search, selectedCats, priceMode, minPrice, maxPrice, dateFrom, dateTo,
    maxAge, tags, geo, sortBy,
    timeOfDay, permanence, onlyVerifiedPlace,
    fromHour, toHour, hideStarted,
    load,
  ]);

  const canLoadMore = hasMoreEvents(events.length, total);
  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || !canLoadMore) return;
    load(
      city, search, selectedCats, priceMode, minPrice, maxPrice, dateFrom, dateTo,
      maxAge, tags, geo, sortBy,
      timeOfDay, permanence, onlyVerifiedPlace,
      fromHour, toHour,
      hideStarted,
      page + 1, true,
    );
  }, [
    isLoadingMore, canLoadMore, load, city, search, selectedCats, priceMode, minPrice, maxPrice, dateFrom, dateTo,
    maxAge, tags, geo, sortBy, timeOfDay, permanence, onlyVerifiedPlace, fromHour, toHour,
    hideStarted, page,
  ]);

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

  const applyQuickDate = useCallback((value: QuickDate | null) => {
    setQuickDate(value);
    if (!value) {
      setDateFrom('');
      setDateTo('');
      return;
    }

    const range = quickDateInputRange(value);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
  }, []);

  const applyDateFrom = useCallback((value: string) => {
    setQuickDate(null);
    setDateFrom(value);
    if (dateTo && value > dateTo) setDateTo(value);
  }, [dateTo]);

  const applyDateTo = useCallback((value: string) => {
    setQuickDate(null);
    setDateTo(value);
  }, []);

  const clearFilters = useCallback(() => {
    setSearchInput(''); setSearch(''); setSelectedCats([]);
    setPriceMode('all'); setMinPrice(''); setMaxPrice(''); setDateFrom(''); setDateTo('');
    setSortBy('date'); setSelectedDate(null);
    setMaxAge(null); setTags([]); setGeo(null);
    setQuickDate(null); setTimeOfDay(null); setPermanence('all');
    setOnlyVerifiedPlace(false);
    setFromHour(null); setToHour(null);
    setHideStarted(false); setHideViewed(false);
  }, []);

  const hasActive = !!(
    search || selectedCats.length || priceMode !== 'all' || minPrice || maxPrice || dateFrom || dateTo ||
    sortBy !== 'date' || maxAge !== null || tags.length || geo ||
    quickDate || timeOfDay || permanence !== 'all' ||
    onlyVerifiedPlace ||
    fromHour !== null || toHour !== null ||
    hideStarted || hideViewed
  );
  const activeFilterCount = useMemo(() => {
    return [
      city !== 'kzn',
      selectedCats.length > 0,
      priceMode !== 'all',
      !!minPrice,
      !!maxPrice,
      !!dateFrom || !!dateTo || !!quickDate,
      sortBy !== 'date',
      maxAge !== null,
      tags.length > 0,
      !!geo,
      !!timeOfDay,
      permanence !== 'all',
      onlyVerifiedPlace,
      fromHour !== null || toHour !== null,
      hideStarted,
      hideViewed,
    ].filter(Boolean).length;
  }, [
    city, selectedCats.length, priceMode, minPrice, maxPrice, dateFrom, dateTo, sortBy, maxAge,
    tags.length, geo, quickDate, timeOfDay, permanence,
    onlyVerifiedPlace, fromHour, toHour, hideStarted, hideViewed,
  ]);

  const showInitialLoading = loading && !hasLoadedOnceRef.current;

  // Backend already handles sorting via order_by; keep a noop memo for downstream code.
  const sortedEvents = events;
  const visibleEvents = useMemo(() => {
    if (!hideViewed) return sortedEvents;
    return sortedEvents.filter(event => !viewedEventIds.has(String(event.kudago_id)));
  }, [hideViewed, sortedEvents, viewedEventIds]);
  const visibleMapEvents = useMemo(() => {
    if (!hideViewed) return mapEvents;
    return mapEvents.filter(event => !viewedEventIds.has(String(event.kudago_id)));
  }, [hideViewed, mapEvents, viewedEventIds]);

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

  const randomEventDisabled = showInitialLoading || isRefreshing || calendarEvents.length === 0;
  const handleRandomEventClick = useCallback(() => {
    if (randomEventDisabled) return;
    const event = pickRandomEvent(calendarEvents);
    if (!event) return;
    router.push(eventDetailHref(event));
  }, [calendarEvents, randomEventDisabled, router]);

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
        <div className="events-search-row" style={{ flexWrap: 'wrap' }}>
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
            onClick={handleRandomEventClick}
            disabled={randomEventDisabled}
            className="btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '.65rem 1rem',
              borderRadius: 'var(--r-full)',
              background: randomEventDisabled ? 'var(--surface-2)' : 'var(--ink)',
              color: randomEventDisabled ? 'var(--text-dim)' : 'var(--text-inverse)',
              border: `1px solid ${randomEventDisabled ? 'var(--border)' : 'var(--ink)'}`,
              boxShadow: randomEventDisabled ? 'none' : 'var(--shadow-sm)',
              fontWeight: 800,
              whiteSpace: 'nowrap',
              cursor: randomEventDisabled ? 'not-allowed' : 'pointer',
              opacity: randomEventDisabled ? 0.65 : 1,
            }}
            aria-label={
              randomEventDisabled
                ? 'Случайное событие недоступно: список пуст или загружается'
                : 'Перейти на случайное событие из текущего списка'
            }
            title={randomEventDisabled ? 'Нет доступных событий' : 'Перейти на случайное событие'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M16 3h5v5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 20 21 3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M21 16v5h-5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15 15l6 6" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 4l5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Случайное событие
          </button>
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
              className="fixed inset-0"
              style={{
                background: 'rgba(0,0,0,0.45)',
                backdropFilter: 'blur(2px)',
                zIndex: FILTER_OVERLAY_Z_INDEX,
              }}
              onClick={() => setFilterDrawerOpen(false)}
              aria-hidden="true"
            />

            <aside
              className="events-filter-drawer fixed top-0 right-0 h-full overflow-y-auto flex flex-col"
              style={{
                width: 460,
                maxWidth: '100vw',
                background: 'var(--surface)',
                borderLeft: '1px solid var(--border)',
                boxShadow: 'var(--shadow-lg)',
                animation: 'filterDrawerSlideIn 0.25s cubic-bezier(0.16,1,0.3,1) forwards',
                zIndex: FILTER_DRAWER_Z_INDEX,
              }}
              role="dialog"
              aria-modal="true"
              aria-label="Фильтры"
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
                    <span className="t-xs" style={{ color: 'var(--text-muted)' }}>Активно: {activeFilterCount}</span>
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

              <div className="flex flex-col gap-4" style={{ padding: '1rem' }}>
                <section className="flex flex-col gap-3">
                  <h3 className="t-label">Основное</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                    <CityFilter value={city} onChange={setCity} />
                    <PriceToggle value={priceMode} onChange={setPriceMode} />
                    <div className="dropdown" ref={sortDropdownRef}>
                      <input type="checkbox" id="events-sort-dropdown" ref={sortCheckboxRef} />
                      <label htmlFor="events-sort-dropdown" className="dropdown-btn" style={{ padding: '.65rem 1rem', fontSize: '.875rem' }} aria-label="Сортировка">
                        <span>{SORT_OPTIONS.find(o => o.value === sortBy)?.label || 'Сортировка'}</span>
                        <span className="arrow"></span>
                      </label>

                      <ul className="dropdown-content" role="menu">
                        {SORT_OPTIONS.map(o => (
                          <li key={o.value}>
                            <button
                              type="button"
                              onClick={() => {
                                if (!(o.value === 'nearest' && !geo)) {
                                  setSortBy(o.value);
                                  if (sortCheckboxRef.current) sortCheckboxRef.current.checked = false;
                                }
                              }}
                              role="menuitem"
                              disabled={o.value === 'nearest' && !geo}
                              style={{
                                padding: '.65rem 1rem',
                                fontSize: '.875rem',
                                opacity: o.value === 'nearest' && !geo ? 0.5 : 1,
                                cursor: o.value === 'nearest' && !geo ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {o.label}{o.value === 'nearest' && !geo ? ' (нужна геолокация)' : ''}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
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
                  <div className="checkbox-wrapper-33">
                    <label className="checkbox">
                      <input
                        className="checkbox__trigger visuallyhidden"
                        type="checkbox"
                        checked={hideViewed}
                        onChange={e => setHideViewed(e.target.checked)}
                        aria-label="Убрать просмотренные события"
                      />
                      <span className="checkbox__symbol">
                        <svg aria-hidden="true" className="icon-checkbox" width="28px" height="28px" viewBox="0 0 28 28" version="1" xmlns="http://www.w3.org/2000/svg">
                          <path d="M4 14l8 7L24 7"></path>
                        </svg>
                      </span>
                      <p className="checkbox__textwrapper" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>Убрать просмотренные</p>
                    </label>
                  </div>
                </section>

                <div style={{ borderTop: '1px solid var(--divider)' }} />

                <section className="flex flex-col gap-3">
                  <h3 className="t-label">Дата и время</h3>
                  <DatePicker
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    onDateFromChange={applyDateFrom}
                    onDateToChange={applyDateTo}
                    minDate={todayStr}
                  />

                  <QuickDateChips active={quickDate} onSelect={applyQuickDate} />
                  <TimeOfDayFilter value={timeOfDay} onChange={setTimeOfDay} />
                  <TimeRangeSlider from={fromHour} to={toHour} onChange={(f, t) => { setFromHour(f); setToHour(t); }} />
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

                <div style={{ borderTop: '1px solid var(--divider)' }} />

                <section className="flex flex-col gap-3">
                  <h3 className="t-label">Возраст</h3>
                  <AgeFilter value={maxAge} onChange={setMaxAge} />
                </section>

                <div style={{ borderTop: '1px solid var(--divider)' }} />

                <section className="flex flex-col gap-3">
                  <h3 className="t-label">Место проведения</h3>
                  <GeoFilter value={geo} onChange={setGeo} />
                </section>

                <div style={{ borderTop: '1px solid var(--divider)' }} />

                <section className="flex flex-col gap-3">
                  <h3 className="t-label">Тип события</h3>
                  <QualityFilters
                    permanence={permanence}
                    onChange={(patch: { permanence?: PermanenceMode }) => {
                      if (patch.permanence !== undefined) setPermanence(patch.permanence);
                    }}
                  />
                  <TimingFilters
                    onlyVerifiedPlace={onlyVerifiedPlace}
                    onChange={(patch: { onlyVerifiedPlace?: boolean }) => {
                      if (patch.onlyVerifiedPlace !== undefined) setOnlyVerifiedPlace(patch.onlyVerifiedPlace);
                    }}
                  />
                </section>

                <div style={{ borderTop: '1px solid var(--divider)' }} />

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
          events={visibleMapEvents}
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
                maxAge, tags, geo, sortBy,
                timeOfDay, permanence, onlyVerifiedPlace,
                fromHour, toHour,
                hideStarted,
                1, false,
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

            {!showInitialLoading && !error && canLoadMore && (
              <div className="flex justify-center mt-8">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="gv-btn-primary"
                  style={{ minWidth: 220, opacity: isLoadingMore ? 0.75 : 1 }}
                >
                  {isLoadingMore ? 'Загружаем...' : `Загрузить еще (${Math.max((total ?? 0) - events.length, 0)})`}
                </button>
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
