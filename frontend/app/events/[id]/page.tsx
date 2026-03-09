'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface EventImage {
  url: string;
  source_name: string;
  source_link: string;
}

interface EventDate {
  start: string | null;
  end: string | null;
  start_time: string | null;
  end_time: string | null;
  is_continuous: boolean;
  is_endless: boolean;
}

interface Participant {
  role: string;
  name: string;
  image_url: string | null;
}

interface EventDetail {
  kudago_id: number;
  title: string;
  short_title: string;
  description: string;
  body_text: string;
  categories: string[];
  tags: string[];
  price: string;
  is_free: boolean;
  age_restriction: string;
  images: EventImage[];
  cover_url: string | null;
  all_dates: EventDate[];
  start_date: string | null;
  start_time: string | null;
  place_title: string;
  place_address: string;
  place_phone: string;
  place_subway: string;
  lat: number | null;
  lon: number | null;
  participants: Participant[];
  site_url: string;
}

function formatDate(dateStr: string | null, timeStr: string | null): string {
  if (!dateStr) return 'Дата не указана';
  const date = new Date(dateStr);
  const formatted = date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return timeStr ? `${formatted} в ${timeStr.slice(0, 5)}` : formatted;
}

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.id as string;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    fetch(`${API_BASE}/kudago/events/${eventId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Ошибка ${res.status}`);
        return res.json();
      })
      .then((data: EventDetail) => {
        setEvent(data);
        setActiveImg(0);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [eventId]);

  /* ─── skeleton ─── */
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
        <nav className="bg-white shadow-sm">
          <div className="container mx-auto px-4 py-4">
            <Link href="/" className="text-2xl font-bold text-blue-600">GatherVibe</Link>
          </div>
        </nav>
        <div className="container mx-auto px-4 py-10 animate-pulse">
          <div className="h-5 w-32 bg-gray-200 rounded mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 space-y-4">
              <div className="w-full h-80 bg-gray-200 rounded-2xl" />
              <div className="flex gap-2">
                {[1,2,3].map(i => <div key={i} className="w-20 h-16 bg-gray-200 rounded-xl" />)}
              </div>
              <div className="h-8 bg-gray-200 rounded w-3/4" />
              <div className="space-y-2">
                {[1,2,3,4].map(i => <div key={i} className="h-4 bg-gray-200 rounded" />)}
              </div>
            </div>
            <div className="space-y-4">
              <div className="h-48 bg-gray-200 rounded-2xl" />
              <div className="h-32 bg-gray-200 rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─── error ─── */
  if (error || !event) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-blue-50 to-purple-50">
        <div className="text-5xl">😕</div>
        <p className="text-gray-600 text-lg">Не удалось загрузить событие</p>
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={() => router.back()}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Назад
        </button>
      </div>
    );
  }

  const images = event.images ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Навбар */}
      <nav className="bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold text-blue-600">GatherVibe</Link>
          <Link href="/events" className="text-gray-500 hover:text-blue-600 transition text-sm">
            ← Все события
          </Link>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-10">
        {/* Хлебные крошки */}
        <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/events" className="hover:text-blue-600 transition">События</Link>
          <span>/</span>
          <span className="text-gray-700 line-clamp-1">{event.short_title || event.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

          {/* Левая колонка: галерея + описание */}
          <div className="lg:col-span-2 space-y-6">

            {/* Галерея */}
            {images.length > 0 ? (
              <div className="space-y-3">
                {/* Главное фото */}
                <div className="relative w-full h-80 sm:h-96 rounded-2xl overflow-hidden bg-gray-100 shadow-md">
                  <Image
                    src={images[activeImg].url}
                    alt={event.title}
                    fill
                    className="object-cover"
                    unoptimized
                    priority
                  />
                  {/* Стрелки навигации */}
                  {images.length > 1 && (
                    <>
                      <button
                        onClick={() => setActiveImg((p) => (p - 1 + images.length) % images.length)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 bg-black bg-opacity-40 hover:bg-opacity-60 text-white w-9 h-9 rounded-full flex items-center justify-center transition"
                      >
                        &#8592;
                      </button>
                      <button
                        onClick={() => setActiveImg((p) => (p + 1) % images.length)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 bg-black bg-opacity-40 hover:bg-opacity-60 text-white w-9 h-9 rounded-full flex items-center justify-center transition"
                      >
                        &#8594;
                      </button>
                      {/* Счётчик */}
                      <span className="absolute bottom-3 right-4 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded-full">
                        {activeImg + 1} / {images.length}
                      </span>
                    </>
                  )}
                  {/* Источник фото */}
                  {images[activeImg].source_name && (
                    <a
                      href={images[activeImg].source_link || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-3 left-4 bg-black bg-opacity-40 text-white text-xs px-2 py-1 rounded-full hover:bg-opacity-60 transition"
                    >
                      © {images[activeImg].source_name}
                    </a>
                  )}
                </div>

                {/* Тамбнейлы */}
                {images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {images.map((img, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveImg(idx)}
                        className={`relative flex-shrink-0 w-20 h-14 rounded-xl overflow-hidden border-2 transition ${
                          idx === activeImg
                            ? 'border-blue-500 opacity-100'
                            : 'border-transparent opacity-60 hover:opacity-90'
                        }`}
                      >
                        <Image src={img.url} alt="" fill className="object-cover" unoptimized />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Заглушка если нет фото */
              <div className="w-full h-64 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-300">
                <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}

            {/* Название + бейджи */}
            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                {event.is_free && (
                  <span className="bg-green-100 text-green-700 text-sm font-semibold px-3 py-1 rounded-full">
                    Бесплатно
                  </span>
                )}
                {event.age_restriction && (
                  <span className="bg-gray-100 text-gray-700 text-sm font-semibold px-3 py-1 rounded-full">
                    {event.age_restriction}+
                  </span>
                )}
                {event.categories.map((cat) => (
                  <span key={cat} className="bg-blue-50 text-blue-600 text-sm px-3 py-1 rounded-full capitalize">
                    {cat}
                  </span>
                ))}
              </div>
              <h1 className="text-3xl font-bold text-gray-900 leading-tight">{event.title}</h1>
            </div>

            {/* Описание */}
            {event.description && (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-800 mb-3">О мероприятии</h2>
                <p className="text-gray-600 leading-relaxed whitespace-pre-line">{event.description}</p>
                {event.body_text && event.body_text !== event.description && (
                  <p className="text-gray-500 leading-relaxed mt-4 whitespace-pre-line">{event.body_text}</p>
                )}
              </div>
            )}

            {/* Участники */}
            {event.participants.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h2 className="text-lg font-bold text-gray-800 mb-4">Участники</h2>
                <div className="flex flex-wrap gap-4">
                  {event.participants.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      {p.image_url ? (
                        <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                          <Image src={p.image_url} alt={p.name} fill className="object-cover" unoptimized />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">
                          {p.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
                        {p.role && <p className="text-xs text-gray-400 capitalize">{p.role}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Тэги */}
            {event.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {event.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full">#{tag}</span>
                ))}
              </div>
            )}
          </div>

          {/* Правая колонка: инфобокс */}
          <div className="space-y-5">

            {/* Цена + кнопка */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="mb-4">
                <p className="text-sm text-gray-400 mb-1">Стоимость</p>
                {event.is_free ? (
                  <p className="text-2xl font-bold text-green-600">Бесплатно</p>
                ) : event.price ? (
                  <p className="text-xl font-bold text-gray-900">{event.price}</p>
                ) : (
                  <p className="text-gray-400">Цена не указана</p>
                )}
              </div>
              {event.site_url && (
                <a
                  href={event.site_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition"
                >
                  Перейти на сайт ↗
                </a>
              )}
            </div>

            {/* Даты */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="text-base font-bold text-gray-800 mb-3">📅 Даты проведения</h2>
              <ul className="space-y-2">
                {event.all_dates.slice(0, 5).map((d, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <span className="text-blue-400 mt-0.5">→</span>
                    <span>
                      {d.is_endless
                        ? 'Постоянно'
                        : formatDate(d.start, d.start_time)}
                      {d.end && !d.is_endless && d.end !== d.start && (
                        <span className="text-gray-400"> — {formatDate(d.end, d.end_time)}</span>
                      )}
                    </span>
                  </li>
                ))}
                {event.all_dates.length > 5 && (
                  <li className="text-xs text-gray-400">
                    +{event.all_dates.length - 5} дат
                  </li>
                )}
              </ul>
            </div>

            {/* Место */}
            {(event.place_title || event.place_address) && (
              <div className="bg-white rounded-2xl p-6 shadow-sm">
                <h2 className="text-base font-bold text-gray-800 mb-3">📍 Место</h2>
                {event.place_title && (
                  <p className="font-semibold text-gray-800 mb-1">{event.place_title}</p>
                )}
                {event.place_address && (
                  <p className="text-sm text-gray-500 mb-2">{event.place_address}</p>
                )}
                {event.place_subway && (
                  <p className="text-sm text-gray-500">
                    <span className="inline-block w-3 h-3 bg-blue-500 rounded-full mr-1.5" />
                    {event.place_subway}
                  </p>
                )}
                {event.place_phone && (
                  <p className="text-sm text-blue-600 mt-2">
                    <a href={`tel:${event.place_phone}`}>{event.place_phone}</a>
                  </p>
                )}
                {event.lat && event.lon && (
                  <a
                    href={`https://yandex.ru/maps/?pt=${event.lon},${event.lat}&z=16&l=map`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 flex items-center gap-1.5 text-sm text-blue-500 hover:text-blue-700 transition"
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
