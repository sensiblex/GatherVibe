import Image from 'next/image';
import Link from 'next/link';

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

function formatDate(dateStr: string | null, timeStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) +
    (timeStr ? ` в ${timeStr.slice(0, 5)}` : '');
}

export default function EventCard({ event }: { event: KudaGoEvent }) {
  const ageLabel = event.age_restriction ? `${event.age_restriction}+` : null;

  return (
    <Link
      href={`/events/${event.kudago_id}`}
      className="group flex flex-col bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
    >
      <div className="relative w-full h-48 bg-gray-100 overflow-hidden">
        {event.cover_url ? (
          <Image src={event.cover_url} alt={event.title} fill
            className="object-cover group-hover:scale-105 transition-transform duration-500" unoptimized />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
            <span className="text-5xl opacity-30">🎭</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />

        <div className="absolute top-3 left-3 flex gap-1.5">
          {event.is_free && (
            <span className="bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow">Бесплатно</span>
          )}
          {ageLabel && (
            <span className="bg-black/50 text-white text-xs font-bold px-2 py-0.5 rounded-full">{ageLabel}</span>
          )}
        </div>

        {event.start_date && (
          <span className="absolute bottom-3 right-3 bg-white/90 text-gray-800 text-xs font-semibold px-2 py-1 rounded-lg shadow">
            {formatDate(event.start_date, event.start_time)}
          </span>
        )}
      </div>

      <div className="flex flex-col flex-1 p-4 gap-2">
        {event.categories?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.categories.slice(0, 2).map((cat, i) => {
              const label = toLabel(cat);
              if (!label) return null;
              return (
                <span key={toKey(cat, i)}
                  className="text-xs bg-indigo-50 text-indigo-600 font-medium px-2 py-0.5 rounded-full capitalize">
                  {label}
                </span>
              );
            })}
          </div>
        )}

        <h3 className="font-bold text-gray-900 text-base leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
          {event.title}
        </h3>

        {event.place_title && (
          <div className="flex items-center gap-1.5 text-sm text-gray-400">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="line-clamp-1">{event.place_title}</span>
          </div>
        )}

        <div className="mt-auto pt-3 border-t border-gray-50 flex items-center justify-between">
          {event.is_free ? (
            <span className="text-emerald-600 font-bold text-sm">Бесплатно</span>
          ) : event.price ? (
            <span className="text-gray-800 font-bold text-sm">{event.price}</span>
          ) : (
            <span className="text-gray-300 text-sm">—</span>
          )}
          <span className="text-xs text-indigo-400 group-hover:text-indigo-600 font-medium transition-colors">
            Подробнее →
          </span>
        </div>
      </div>
    </Link>
  );
}
