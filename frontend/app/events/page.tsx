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
import { localIsoDate as _localIsoDate } from './utils';
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
  const [city, setCity]               = useState<CitySlug>('kzn');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [priceMode, setPriceMode]     = useState<PriceMode>('all');
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
    const cityParam = p.get('city');
    if (cityParam && isValidCity(cityParam)) setCity(cityParam);
    const q = p.get('search') || '';
    if (q) { setSearchInput(q); setSearch(q); }
    const cats = p.get('categories');
    if (cats) setSelectedCats(cats.split(',').filter(Boolean));
    const priceParam = p.get('price');
    if (priceParam === 'free' || priceParam === 'paid') setPriceMode(priceParam);
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
    const qs = p.toString();
    router.replace(qs ? `/events?${qs}` : '/events', { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, search, selectedCats, priceMode, dateFrom, dateTo, sortBy, maxAge, tags, placeSearch, geo]);

  // Load events from API
  const load = useCallback(async (
    loc: CitySlug, s: string, cats: string[], price: PriceMode, from: string, to: string,
    age: number | null, ts: string[], ps: string, gp: GeoPoint | null, sort: SortMode,
    qd: QuickDate | null, tod: TimeOfDay | null, perm: PermanenceMode,
    hc: boolean, hp: boolean, hfs: boolean, mna: number | null,
    swh: number | null, dm: 'short' | 'long' | null, hs: boolean, ovp: boolean,
    fh: number | null, th: number | null,
    wds: number[], hst: boolean,
  ) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
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
    load(
      city, search, selectedCats, priceMode, dateFrom, dateTo,
      maxAge, tags, placeSearch, geo, sortBy,
      quickDate, timeOfDay, permanence, hasCover, hasParty, hasFreeSpots, minAttendees,
      startingWithinHours, durationMode, hasSchedules, onlyVerifiedPlace,
      fromHour, toHour,
      weekdays, hideStarted,
    );
  }, [
    city, search, selectedCats, priceMode, dateFrom, dateTo,
    maxAge, tags, placeSearch, geo, sortBy,
    quickDate, timeOfDay, permanence, hasCover, hasParty, hasFreeSpots, minAttendees,
    startingWithinHours, durationMode, hasSchedules, onlyVerifiedPlace,
    fromHour, toHour, weekdays, hideStarted,
    load,
  ]);

  // Debounced place search
  const onPlaceSearchChange = (v: string) => {
    setPlaceSearchInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v.trim()) setPlaceSearch('');
    else debounceRef.current = setTimeout(() => setPlaceSearch(v.trim()), 500);
  };

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
    setSearchInput(''); setSearch(''); setSelectedCats([]);
    setPriceMode('all'); setDateFrom(''); setDateTo('');
    setSortBy('date'); setSelectedDate(null);
    setMaxAge(null); setTags([]);
    setPlaceSearchInput(''); setPlaceSearch(''); setGeo(null);
    setQuickDate(null); setTimeOfDay(null); setPermanence('all');
    setHasCover(false); setHasParty(false); setHasFreeSpots(false); setMinAttendees(null);
    setStartingWithinHours(null); setDurationMode(null);
    setHasSchedules(false); setOnlyVerifiedPlace(false);
    setFromHour(null); setToHour(null);
    setWeekdays([]); setHideStarted(false);
  };

  const hasActive = !!(
    search || selectedCats.length || priceMode !== 'all' || dateFrom || dateTo ||
    sortBy !== 'date' || maxAge !== null || tags.length || placeSearch || geo ||
    quickDate || timeOfDay || permanence !== 'all' ||
    hasCover || hasParty || hasFreeSpots || minAttendees ||
    startingWithinHours || durationMode || hasSchedules || onlyVerifiedPlace ||
    fromHour !== null || toHour !== null ||
    weekdays.length > 0 || hideStarted
  );

  // Backend already handles sorting via order_by; keep a noop memo for downstream code.
  const sortedEvents = events;

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
            <h1 className="t-display">
              События в {KUDAGO_CITIES.find(c => c.slug === city)?.locative ?? ''}
            </h1>
            {total !== null && !loading && (
              <p className="t-sm" style={{ marginTop: 8 }}>
                {total.toLocaleString('ru-RU')} мероприятий
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <CityFilter value={city} onChange={setCity} />
            {hasActive && (
              <button onClick={clearFilters} className="btn btn-ghost btn-sm">
                Сбросить ×
              </button>
            )}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortMode)}
              className="input"
              style={{ width: 'auto', padding: '.5rem 1.125rem', fontSize: '.8125rem' }}
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
          <PriceToggle value={priceMode} onChange={setPriceMode} />
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

          <AgeFilter value={maxAge} onChange={setMaxAge} />
          <PlaceSearchInput value={placeSearchInput} onChange={onPlaceSearchChange} />
          <GeoFilter value={geo} onChange={setGeo} />
        </div>

        <div
          style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px 8px', width: '100%', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}
        >
          <QuickDateChips active={quickDate} onSelect={setQuickDate} />
          <TimeOfDayFilter value={timeOfDay} onChange={setTimeOfDay} />
        </div>

        <div
          style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px 8px', width: '100%' }}
        >
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
        </div>

        <div
          style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px 8px', width: '100%' }}
        >
          <QualityFilters
            permanence={permanence}
            hasCover={hasCover}
            onChange={(patch) => {
              if (patch.permanence !== undefined) setPermanence(patch.permanence);
              if (patch.hasCover !== undefined) setHasCover(patch.hasCover);
            }}
          />
        </div>

        <div
          style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px 8px', width: '100%' }}
        >
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
        </div>

        <div
          style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px 8px', width: '100%', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
        >
          <TimeRangeSlider from={fromHour} to={toHour} onChange={(f, t) => { setFromHour(f); setToHour(t); }} />
          <WeekdayPicker selected={weekdays} onChange={setWeekdays} />
          <button
            aria-pressed={hideStarted}
            onClick={() => setHideStarted(v => !v)}
            style={{
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
            ⏭ Ещё не начались
          </button>
        </div>

        <div
          style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px 16px', width: '100%' }}
        >
          <TagPills selected={tags} onChange={setTags} />
        </div>

        {categories.length > 0 && (
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px 40px', width: '100%', overflow: 'hidden' }}>
            <CategoryPills
              categories={categories}
              selected={selectedCats}
              onToggle={(slug) => setSelectedCats(cur => toggleCategory(cur, slug))}
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
              onClick={() => load(
                city, search, selectedCats, priceMode, dateFrom, dateTo,
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
