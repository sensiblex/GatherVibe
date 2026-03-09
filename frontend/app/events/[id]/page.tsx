'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import Navbar from '../../components/Navbar';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type RawCategory = string | { id?: number; slug: string; name: string; name_plural?: string };
function getCatLabel(cat: RawCategory): string {
  if (typeof cat === 'string') return cat;
  return cat.name || cat.slug;
}
function getCatKey(cat: RawCategory): string {
  if (typeof cat === 'string') return cat;
  return cat.slug;
}

interface EventImage { url: string; source_name: string; source_link: string; }
interface EventDate {
  start: string | null; end: string | null;
  start_time: string | null; end_time: string | null;
  is_continuous: boolean; is_endless: boolean;
}
interface Participant { role: string; name: string; image_url: string | null; }
interface EventDetail {
  kudago_id: number;
  title: string; short_title: string;
  description: string; body_text: string;
  categories: RawCategory[];
  tags: string[];
  price: string; is_free: boolean; age_restriction: string;
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
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="container mx-auto px-4 py-10 animate-pulse">
        <div className="h-4 w-40 bg-gray-200 rounded mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-4">
            <div className="w-full h-96 bg-gray-200 rounded-3xl" />
            <div className="flex gap-2">{[1,2,3].map(i=><div key={i} className="w-20 h-14 bg-gray-200 rounded-xl"/>)}</div>
            <div className="h-8 bg-gray-200 rounded w-3/4" />
            {[1,2,3].map(i=><div key={i} className="h-4 bg-gray-200 rounded"/>)}
          </div>
          <div className="space-y-4">
            <div className="h-40 bg-gray-200 rounded-3xl" />
            <div className="h-40 bg-gray-200 rounded-3xl" />
          </div>
        </div>
      </div>
    </div>
  );

  if (error || !event) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <span className="text-5xl">😕</span>
        <p className="text-gray-600">Не удалось загрузить событие</p>
        <p className="text-red-400 text-sm">{error}</p>
        <button onClick={() => router.back()}
          className="bg-indigo-600 text-white px-6 py-2 rounded-xl hover:bg-indigo-700 transition">Назад</button>
      </div>
    </div>
  );

  const images = event.images ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="container mx-auto px-4 py-10">
        <nav className="flex items-center gap-2 text-sm text-gray-400 mb-8">
          <Link href="/events" className="hover:text-indigo-600 transition">События</Link>
          <span>/</span>
          <span className="text-gray-700 line-clamp-1 max-w-xs">{event.short_title || event.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          {/* Левая колонка */}
          <div className="lg:col-span-2 space-y-6">
            {images.length > 0 ? (
              <div className="space-y-3">
                <div className="relative w-full h-80 sm:h-[420px] rounded-3xl overflow-hidden bg-gray-100 shadow-lg">
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
                        {activeImg + 1} / {images.length}
                      </span>
                    </>
                  )}
                  {images[activeImg].source_name && (
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
              <div className="w-full h-64 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-3xl flex items-center justify-center">
                <span className="text-6xl opacity-20">🎭</span>
              </div>
            )}

            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                {event.is_free && <span className="bg-emerald-100 text-emerald-700 text-sm font-bold px-3 py-1 rounded-full">Бесплатно</span>}
                {event.age_restriction && <span className="bg-gray-100 text-gray-700 text-sm font-bold px-3 py-1 rounded-full">{event.age_restriction}+</span>}
                {event.categories.map(cat => (
                  <span key={getCatKey(cat)} className="bg-indigo-50 text-indigo-600 text-sm font-medium px-3 py-1 rounded-full capitalize">
                    {getCatLabel(cat)}
                  </span>
                ))}
              </div>
              <h1 className="text-3xl font-black text-gray-900 leading-tight">{event.title}</h1>
            </div>

            {event.description && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h2 className="text-base font-bold text-gray-800 mb-3">О мероприятии</h2>
                <p className="text-gray-600 leading-relaxed whitespace-pre-line">{event.description}</p>
                {event.body_text && event.body_text !== event.description && (
                  <p className="text-gray-500 leading-relaxed mt-4 whitespace-pre-line">{event.body_text}</p>
                )}
              </div>
            )}

            {event.participants.length > 0 && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h2 className="text-base font-bold text-gray-800 mb-4">Участники</h2>
                <div className="flex flex-wrap gap-4">
                  {event.participants.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      {p.image_url ? (
                        <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-100 shrink-0">
                          <Image src={p.image_url} alt={p.name} fill className="object-cover" unoptimized />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm shrink-0">
                          {p.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{p.name}</p>
                        {p.role && <p className="text-xs text-gray-400">{p.role}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {event.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {event.tags.map(tag => (
                  <span key={tag} className="text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full">#{tag}</span>
                ))}
              </div>
            )}
          </div>

          {/* Правая колонка */}
          <div className="space-y-5 lg:sticky lg:top-24 self-start">
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">Стоимость</p>
              {event.is_free ? (
                <p className="text-2xl font-black text-emerald-600 mb-4">Бесплатно</p>
              ) : event.price ? (
                <p className="text-xl font-black text-gray-900 mb-4">{event.price}</p>
              ) : (
                <p className="text-gray-400 mb-4">Цена не указана</p>
              )}
              {event.site_url && (
                <a href={event.site_url} target="_blank" rel="noopener noreferrer"
                  className="block w-full text-center bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-bold hover:opacity-90 shadow-md shadow-indigo-100 transition">
                  Перейти на сайт ↗
                </a>
              )}
            </div>

            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">📅 Даты</h2>
              <ul className="space-y-2">
                {event.all_dates.slice(0, 5).map((d, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <span className="text-indigo-400 mt-0.5">→</span>
                    <span>
                      {d.is_endless ? 'Постоянно' : formatDate(d.start, d.start_time)}
                      {d.end && !d.is_endless && d.end !== d.start && (
                        <span className="text-gray-400"> — {formatDate(d.end, d.end_time)}</span>
                      )}
                    </span>
                  </li>
                ))}
                {event.all_dates.length > 5 && (
                  <li className="text-xs text-gray-400">+{event.all_dates.length - 5} дат</li>
                )}
              </ul>
            </div>

            {(event.place_title || event.place_address) && (
              <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-4">📍 Место</h2>
                {event.place_title && <p className="font-bold text-gray-900 mb-1">{event.place_title}</p>}
                {event.place_address && <p className="text-sm text-gray-500 mb-2">{event.place_address}</p>}
                {event.place_subway && (
                  <p className="text-sm text-gray-500 flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />{event.place_subway}
                  </p>
                )}
                {event.place_phone && (
                  <a href={`tel:${event.place_phone}`}
                    className="text-sm text-indigo-600 hover:text-indigo-800 mt-2 block">{event.place_phone}</a>
                )}
                {event.lat && event.lon && (
                  <a href={`https://yandex.ru/maps/?pt=${event.lon},${event.lat}&z=16`}
                    target="_blank" rel="noopener noreferrer"
                    className="mt-4 flex items-center gap-2 text-sm text-indigo-500 hover:text-indigo-700 font-medium">
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
