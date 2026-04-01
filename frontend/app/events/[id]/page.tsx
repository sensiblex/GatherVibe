'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import EventAttendees from '../../components/EventAttendees';
import EventParty from '../../components/EventParty';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const CATEGORY_RU: Record<string, string> = {
  concert: 'Концерт', theater: 'Театр', theatre: 'Театр',
  exhibition: 'Выставка', movie: 'Кино', cinema: 'Кино',
  festival: 'Фестиваль', sport: 'Спорт', sports: 'Спорт',
  other: 'Разное', holiday: 'Праздник', 'kids-holiday': 'Детский праздник',
  education: 'Образование', lecture: 'Лекция', business: 'Бизнес',
  'business-events': 'Бизнес', tour: 'Экскурсия', excursion: 'Экскурсия',
  party: 'Вечеринка', nightlife: 'Ночная жизнь',
  'stand-up': 'Стэндап', standup: 'Стэндап', comedy: 'Комедия',
  opera: 'Опера', ballet: 'Балет', musical: 'Мюзикл',
  'open-air': 'Опен-эйр', art: 'Искусство', 'art-object': 'Искусство',
  circus: 'Цирк', magic: 'Фокус',
  'master-class': 'Мастер-класс', masterclass: 'Мастер-класс', workshop: 'Мастер-класс',
  literature: 'Литература', food: 'Еда', 'food-wine': 'Еда и вино',
  yoga: 'Йога', fitness: 'Фитнес', dance: 'Танцы',
  gaming: 'Игры', quest: 'Квест', charity: 'Благотворительность',
  science: 'Наука', technology: 'Технологии',
  'for-kids': 'Для детей', kids: 'Для детей', family: 'Семейное',
  outdoor: 'На улице', online: 'Онлайн',
  'rock-music': 'Рок', jazz: 'Джаз', 'jazz-blues': 'Джаз / Блюз',
  classical: 'Классика', 'classical-music': 'Классика',
  electronic: 'Электронная музыка', 'hip-hop': 'Хип-хоп',
  pop: 'Поп', metal: 'Метал', folk: 'Фольк',
  drama: 'Драма', documentary: 'Документальный',
  animation: 'Анимация', cartoon: 'Мультфильм',
  networking: 'Нетворкинг', fashion: 'Мода',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toLabel(val: any): string {
  if (!val && val !== 0) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') return String(val.name ?? val.slug ?? val.title ?? val.id ?? '');
  return String(val);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toKey(val: any, idx: number): string {
  return toLabel(val) || String(idx);
}
function translateTag(raw: string): string {
  return CATEGORY_RU[raw.toLowerCase().trim()] ?? raw;
}

interface EventImage { url: string; source_name: string; source_link: string; }
interface EventDate {
  start: string | null; end: string | null;
  start_time: string | null; end_time: string | null;
  is_continuous: boolean; is_endless: boolean;
}
interface Participant { role: string; name: string; image_url: string | null; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArr = any[];

interface EventDetail {
  kudago_id: number;
  title: string; short_title: string;
  description: string; body_text: string;
  categories: AnyArr; tags: AnyArr;
  price: string; is_free: boolean;
  age_restriction: string | number | null;
  images: EventImage[]; cover_url: string | null;
  all_dates: EventDate[];
  start_date: string | null; start_time: string | null;
  place_title: string; place_address: string;
  place_phone: string; place_subway: string;
  lat: number | null; lon: number | null;
  participants: Participant[];
  site_url: string;
}

function formatDate(dateStr: string | null, timeStr: string | null): string {
  if (!dateStr) return 'Дата не указана';
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  }) + (timeStr ? ` в ${timeStr.slice(0, 5)}` : '');
}

// Переиспользуемый стиль «карточка» через CSS-переменные
const cardStyle: React.CSSProperties = {
  background: 'var(--card-bg, var(--surface, #ffffff))',
  border: '1px solid var(--border, #e5e7eb)',
};

export default function EventDetailPage() {
  const params  = useParams();
  const router  = useRouter();
  const eventId = params?.id as string;
  const [event, setEvent]         = useState<EventDetail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => {
    if (!eventId) return;
    fetch(`${API_BASE}/kudago/events/${eventId}`)
      .then(r => { if (!r.ok) throw new Error(`Ошибка ${r.status}`); return r.json(); })
      .then((d: EventDetail) => { setEvent(d); setActiveImg(0); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="container mx-auto px-4 py-10 animate-pulse">
        <div className="h-4 w-40 rounded mb-8" style={{ background: 'var(--surface-2, #e5e7eb)' }} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-4">
            <div className="w-full h-96 rounded-3xl" style={{ background: 'var(--surface-2, #e5e7eb)' }} />
            <div className="flex gap-2">
              {[1,2,3].map(i => (
                <div key={i} className="w-20 h-14 rounded-xl" style={{ background: 'var(--surface-2, #e5e7eb)' }} />
              ))}
            </div>
            <div className="h-8 rounded w-3/4" style={{ background: 'var(--surface-2, #e5e7eb)' }} />
            {[1,2,3].map(i => <div key={i} className="h-4 rounded" style={{ background: 'var(--surface-2, #e5e7eb)' }} />)}
          </div>
          <div className="space-y-4">
            <div className="h-40 rounded-3xl" style={{ background: 'var(--surface-2, #e5e7eb)' }} />
            <div className="h-40 rounded-3xl" style={{ background: 'var(--surface-2, #e5e7eb)' }} />
          </div>
        </div>
      </div>
    </div>
  );

  if (error || !event) return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <span className="text-5xl">😕</span>
        <p style={{ color: 'var(--text-muted)' }}>Не удалось загрузить событие</p>
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={() => router.back()}
          className="px-6 py-2 rounded-xl font-bold hover:opacity-90 transition"
          style={{ background: 'var(--accent, #4f46e5)', color: '#fff' }}
        >
          Назад
        </button>
      </div>
    </div>
  );

  const images = Array.isArray(event.images) ? event.images : [];
  const ageLabel = event.age_restriction ? `${event.age_restriction}+` : null;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <main className="container mx-auto px-4 py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          <Link href="/events" className="hover:underline transition" style={{ color: 'var(--text-muted)' }}>
            События
          </Link>
          <span>/</span>
          <span className="line-clamp-1 max-w-xs" style={{ color: 'var(--text)' }}>
            {event.short_title || event.title}
          </span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* ── LEFT COLUMN ────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Gallery */}
            {images.length > 0 ? (
              <div className="space-y-3">
                <div
                  className="relative w-full h-80 sm:h-[420px] rounded-3xl overflow-hidden shadow-lg"
                  style={{ background: 'var(--surface-2, #e5e7eb)' }}
                >
                  <Image src={images[activeImg].url} alt={event.title}
                    fill className="object-cover" unoptimized priority />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                  {images.length > 1 && (
                    <>
                      <button onClick={() => setActiveImg(p => (p - 1 + images.length) % images.length)}
                        className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white w-10 h-10 rounded-full flex items-center justify-center transition text-lg">
                        &#8592;
                      </button>
                      <button onClick={() => setActiveImg(p => (p + 1) % images.length)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white w-10 h-10 rounded-full flex items-center justify-center transition text-lg">
                        &#8594;
                      </button>
                      <span className="absolute bottom-4 right-4 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full">
                        {activeImg + 1} / {images.length}
                      </span>
                    </>
                  )}
                  {images[activeImg]?.source_name && (
                    <a href={images[activeImg].source_link || '#'} target="_blank" rel="noopener noreferrer"
                      className="absolute bottom-4 left-4 bg-black/40 text-white text-xs px-2.5 py-1 rounded-full hover:bg-black/60 transition">
                      © {images[activeImg].source_name}
                    </a>
                  )}
                </div>
                {images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {images.map((img, idx) => (
                      <button key={idx} onClick={() => setActiveImg(idx)}
                        className={`relative shrink-0 w-20 h-14 rounded-xl overflow-hidden border-2 transition ${
                          idx === activeImg ? 'border-indigo-500' : 'border-transparent opacity-50 hover:opacity-80'
                        }`}>
                        <Image src={img.url} alt="" fill className="object-cover" unoptimized />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div
                className="w-full h-64 rounded-3xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, var(--surface-2, #eef2ff), var(--surface-3, #f5f3ff))' }}
              >
                <span className="text-6xl opacity-20">🎭</span>
              </div>
            )}

            {/* Title + badges */}
            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                {event.is_free && (
                  <span className="bg-emerald-500/20 text-emerald-500 text-sm font-bold px-3 py-1 rounded-full">
                    Бесплатно
                  </span>
                )}
                {ageLabel && (
                  <span
                    className="text-sm font-bold px-3 py-1 rounded-full"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                  >
                    {ageLabel}
                  </span>
                )}
                {Array.isArray(event.categories) && event.categories.map((cat, i) => {
                  const label = toLabel(cat);
                  if (!label) return null;
                  return (
                    <span
                      key={toKey(cat, i)}
                      className="text-sm font-medium px-3 py-1 rounded-full"
                      style={{ background: 'var(--badge-bg, #eef2ff)', color: 'var(--accent, #4f46e5)' }}
                    >
                      {translateTag(label)}
                    </span>
                  );
                })}
              </div>
              <h1 className="text-3xl font-black leading-tight" style={{ color: 'var(--text)' }}>
                {event.title}
              </h1>
            </div>

            {/* Description */}
            {event.description && (
              <div className="rounded-2xl p-6 shadow-sm" style={cardStyle}>
                <h2 className="text-base font-bold mb-3" style={{ color: 'var(--text)' }}>О мероприятии</h2>
                <p className="leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-muted)' }}>
                  {event.description}
                </p>
                {event.body_text && event.body_text !== event.description && (
                  <p className="leading-relaxed mt-4 whitespace-pre-line" style={{ color: 'var(--text-muted)' }}>
                    {event.body_text}
                  </p>
                )}
              </div>
            )}

            <EventAttendees eventId={eventId} />
            <EventParty eventId={eventId} />

            {/* Participants */}
            {Array.isArray(event.participants) && event.participants.length > 0 && (
              <div className="rounded-2xl p-6 shadow-sm" style={cardStyle}>
                <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text)' }}>Участники</h2>
                <div className="flex flex-wrap gap-4">
                  {event.participants.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      {p.image_url ? (
                        <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0"
                          style={{ background: 'var(--surface-2)' }}>
                          <Image src={p.image_url} alt={p.name} fill className="object-cover" unoptimized />
                        </div>
                      ) : (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                          style={{ background: 'var(--badge-bg, #eef2ff)', color: 'var(--accent, #4f46e5)' }}
                        >
                          {p.name?.charAt(0) || '?'}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{p.name}</p>
                        {p.role && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{toLabel(p.role)}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {Array.isArray(event.tags) && event.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {event.tags.map((tag, i) => {
                  const label = toLabel(tag);
                  if (!label) return null;
                  return (
                    <span
                      key={toKey(tag, i)}
                      className="text-xs px-3 py-1 rounded-full"
                      style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                    >
                      #{translateTag(label)}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN ───────────────────────────── */}
          <div className="space-y-5 lg:sticky lg:top-24 self-start">

            {/* Price card */}
            <div className="rounded-2xl p-6 shadow-sm" style={cardStyle}>
              <p
                className="text-xs uppercase font-semibold tracking-wide mb-1"
                style={{ color: 'var(--text-muted)' }}
              >
                Стоимость
              </p>
              {event.is_free ? (
                <p className="text-2xl font-black text-emerald-500 mb-4">Бесплатно</p>
              ) : event.price ? (
                <p className="text-xl font-black mb-4" style={{ color: 'var(--text)' }}>{event.price}</p>
              ) : (
                <p className="mb-4" style={{ color: 'var(--text-muted)' }}>Цена не указана</p>
              )}
              {event.site_url && (
                <a
                  href={event.site_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center py-3 rounded-xl font-bold hover:opacity-90 transition shadow-md"
                  style={{ background: 'var(--accent-gradient, linear-gradient(135deg,#4f46e5,#7c3aed))', color: '#fff' }}
                >
                  Перейти на сайт ↗
                </a>
              )}
            </div>

            {/* Dates */}
            {Array.isArray(event.all_dates) && event.all_dates.length > 0 && (
              <div className="rounded-2xl p-6 shadow-sm" style={cardStyle}>
                <h2
                  className="text-xs font-bold uppercase tracking-wide mb-4"
                  style={{ color: 'var(--text-muted)' }}
                >
                  📅 Даты
                </h2>
                <ul className="space-y-2">
                  {event.all_dates.slice(0, 5).map((d, i) => (
                    <li key={i} className="text-sm flex items-start gap-2" style={{ color: 'var(--text-muted)' }}>
                      <span style={{ color: 'var(--accent)' }} className="mt-0.5">→</span>
                      <span>
                        {d.is_endless ? 'Постоянно' : formatDate(d.start, d.start_time)}
                        {d.end && !d.is_endless && d.end !== d.start && (
                          <span style={{ color: 'var(--text-faint, #9ca3af)' }}>
                            {' '}— {formatDate(d.end, d.end_time)}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                  {event.all_dates.length > 5 && (
                    <li className="text-xs" style={{ color: 'var(--text-faint)' }}>
                      +{event.all_dates.length - 5} дат
                    </li>
                  )}
                </ul>
              </div>
            )}

            {/* Place */}
            {(event.place_title || event.place_address) && (
              <div className="rounded-2xl p-6 shadow-sm" style={cardStyle}>
                <h2
                  className="text-xs font-bold uppercase tracking-wide mb-4"
                  style={{ color: 'var(--text-muted)' }}
                >
                  📍 Место
                </h2>
                {event.place_title && (
                  <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>{event.place_title}</p>
                )}
                {event.place_address && (
                  <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>{event.place_address}</p>
                )}
                {event.place_subway && (
                  <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
                    {toLabel(event.place_subway)}
                  </p>
                )}
                {event.place_phone && (
                  <a
                    href={`tel:${event.place_phone}`}
                    className="text-sm mt-2 block hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    {event.place_phone}
                  </a>
                )}
                {event.lat && event.lon && (
                  <a
                    href={`https://yandex.ru/maps/?pt=${event.lon},${event.lat}&z=16`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 flex items-center gap-2 text-sm font-medium hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    🗺️ Открыть на карте
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
