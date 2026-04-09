'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface KudaGoEvent {
  kudago_id: number;
  title: string;
  short_title: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  categories: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tags: any[];
  price: string;
  is_free: boolean;
  age_restriction: string | number | null;
  start_date: string | null;
  start_time: string | null;
  place_title: string;
  place_address: string;
  lat: number | null;
  lon: number | null;
  cover_url: string | null;
  site_url: string;
}

const CATEGORY_RU: Record<string, string> = {
  concert: 'Концерт', theater: 'Театр', theatre: 'Театр',
  exhibition: 'Выставка', movie: 'Кино', cinema: 'Кино',
  festival: 'Фестиваль', sport: 'Спорт', sports: 'Спорт',
  other: 'Разное', holiday: 'Праздник', 'kids-holiday': 'Детский праздник',
  education: 'Образование', lecture: 'Лекция', 'business-events': 'Бизнес',
  business: 'Бизнес', tour: 'Экскурсия', excursion: 'Экскурсия',
  party: 'Вечеринка', nightlife: 'Ночная жизнь',
  'stand-up': 'Стэндап', standup: 'Стэндап', comedy: 'Комедия',
  opera: 'Опера', ballet: 'Балет', musical: 'Мюзикл',
  'open-air': 'Опен-эйр', 'art-object': 'Искусство', art: 'Искусство',
  circus: 'Цирк', magic: 'Фокус',
  'master-class': 'Мастер-класс', masterclass: 'Мастер-класс', workshop: 'Мастер-класс',
  'photo-video': 'Фото/Видео', photography: 'Фотография',
  literature: 'Литература', book: 'Книги',
  food: 'Еда', 'food-wine': 'Еда и вино',
  yoga: 'Йога', fitness: 'Фитнес', dance: 'Танцы',
  gaming: 'Игры', 'computer-games': 'Игры', quest: 'Квест',
  charity: 'Благотворительность', fashion: 'Мода',
  science: 'Наука', technology: 'Технологии', health: 'Здоровье',
  nature: 'Природа', animals: 'Животные', religion: 'Религия',
  'social-activity': 'Общество', networking: 'Нетворкинг',
  'speed-dating': 'Спид-дейтинг',
  'rock-music': 'Рок', 'jazz-blues': 'Джаз / Блюз', jazz: 'Джаз',
  blues: 'Блюз', 'classical-music': 'Классика', classical: 'Классика',
  'electronic-music': 'Электронная музыка', electronic: 'Электронная музыка',
  'hip-hop': 'Хип-хоп', pop: 'Поп', 'pop-music': 'Поп', metal: 'Метал',
  folk: 'Фольк', reggae: 'Регги', 'r-n-b': 'R&B', soul: 'Саул',
  funk: 'Фанк', acoustic: 'Акустика', 'world-music': 'Этническая музыка',
  'action-movie': 'Боевик', comedy_film: 'Комедия', drama: 'Драма',
  horror: 'Ужасы', thriller: 'Триллер', cartoon: 'Мультфильм',
  animation: 'Анимация', documentary: 'Документальный',
  'sci-fi': 'Фантастика', fantasy: 'Фэнтези', adventure: 'Приключения',
  drama_play: 'Драма', puppet: 'Кукольный театр',
  improvisation: 'Импровизация', 'performance-art': 'Перформанс',
  performance: 'Перформанс',
  'for-kids': 'Для детей', kids: 'Для детей', children: 'Для детей',
  family: 'Семейное', free: 'Бесплатно', online: 'Онлайн',
  outdoor: 'На улице', indoor: 'В помещении',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toLabel(val: any): string {
  if (!val && val !== 0) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') return String(val.name ?? val.slug ?? val.id ?? '');
  return String(val);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toKey(val: any, idx: number): string {
  return toLabel(val) || String(idx);
}
function translateTag(raw: string): string {
  return CATEGORY_RU[raw.toLowerCase().trim()] ?? raw;
}
function formatDate(dateStr: string | null, timeStr: string | null): string {
  if (!dateStr) return '';
  
  const eventDate = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Don't show date for past events
  if (eventDate < today) {
    return '';
  }
  
  return (
    eventDate.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) +
    (timeStr ? ` в ${timeStr.slice(0, 5)}` : '')
  );
}

// ──────────────────────────────────────────────────────────────────────
export default function EventCard({ event }: { event: KudaGoEvent }) {
  const ageLabel = event.age_restriction ? (typeof event.age_restriction === 'string' && event.age_restriction.endsWith('+') ? event.age_restriction : `${event.age_restriction}+`) : null;

  // ── Задача 5: счётчик участников ──
  const [attendeeCount, setAttendeeCount] = useState<number | null>(null);

  useEffect(() => {
    if (!event.kudago_id) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/attendees/${event.kudago_id}`);
        if (!res.ok) return;
        const data: { id: number }[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setAttendeeCount(data.length);
        }
      } catch {
        // не блокируем рендер карточки
      }
    })();
  }, [event.kudago_id]);

  return (
    <Link
      href={`/events/${event.kudago_id}`}
      className="group flex flex-col rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      {/* IMAGE */}
      <div
        className="relative w-full h-48 overflow-hidden"
        style={{ background: 'var(--surface-2)' }}
      >
        {event.cover_url ? (
          <Image
            src={event.cover_url}
            alt={event.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--surface-2), var(--surface-off))' }}>
            <span className="text-5xl opacity-30">🎭</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

        <div className="absolute top-3 left-3 flex gap-1.5">
          {event.is_free && (
            <span className="bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">
              Бесплатно
            </span>
          )}
          {ageLabel && (
            <span className="bg-black/50 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {ageLabel}
            </span>
          )}
        </div>

        {formatDate(event.start_date, event.start_time) && (
          <span
            className="absolute bottom-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-md"
            style={{
              background: 'rgba(0,0,0,0.62)',
              color: '#ffffff',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          >
            {formatDate(event.start_date, event.start_time)}
          </span>
        )}
      </div>

      {/* BODY */}
      <div className="flex flex-col flex-1 p-4 gap-2">
        {event.categories?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.categories.slice(0, 2).map((cat, i) => {
              const raw = toLabel(cat);
              if (!raw) return null;
              return (
                <span
                  key={toKey(cat, i)}
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{
                    background: 'var(--primary-hl)',
                    color: 'var(--primary)',
                  }}
                >
                  {translateTag(raw)}
                </span>
              );
            })}
          </div>
        )}

        <h3
          className="font-bold text-base leading-snug line-clamp-2 transition-colors"
          style={{ color: 'var(--text)' }}
        >
          {event.title}
        </h3>

        {event.place_title && (
          <div
            className="flex items-center gap-1.5 text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="line-clamp-1">{event.place_title}</span>
          </div>
        )}

        {/* FOOTER */}
        <div
          className="mt-auto pt-3 flex items-center justify-between gap-2"
          style={{ borderTop: '1px solid var(--divider)' }}
        >
          {/* Цена */}
          <div>
            {event.is_free ? (
              <span className="font-bold text-sm" style={{ color: 'var(--success)' }}>Бесплатно</span>
            ) : event.price ? (
              <span className="font-bold text-sm" style={{ color: 'var(--text)' }}>{event.price}</span>
            ) : (
              <span className="text-sm" style={{ color: 'var(--text-faint)' }}>—</span>
            )}
          </div>

          {/* ── Счётчик + ссылка ── */}
          <div className="flex items-center gap-3">
            {attendeeCount !== null && attendeeCount > 0 && (
              <span className="text-xs text-indigo-500 font-semibold flex items-center gap-1">
                👥 {attendeeCount} идут
              </span>
            )}
            <span
              className="text-xs font-medium"
              style={{ color: 'var(--primary)' }}
            >
              Подробнее →
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
