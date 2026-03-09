import Image from 'next/image';
import Link from 'next/link';

export interface KudaGoEvent {
  kudago_id: number;
  title: string;
  short_title: string;
  description: string;
  categories: string[];
  tags: string[];
  price: string;
  is_free: boolean;
  age_restriction: string;
  start_date: string | null;
  start_time: string | null;
  place_title: string;
  place_address: string;
  lat: number | null;
  lon: number | null;
  cover_url: string | null;
  site_url: string;
}

interface EventCardProps {
  event: KudaGoEvent;
}

function formatDate(dateStr: string | null, timeStr: string | null): string {
  if (!dateStr) return 'Дата не указана';
  const date = new Date(dateStr);
  const formatted = date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
  return timeStr ? `${formatted} в ${timeStr.slice(0, 5)}` : formatted;
}

export default function EventCard({ event }: EventCardProps) {
  const ageLabel = event.age_restriction ? `${event.age_restriction}+` : null;

  return (
    <Link
      href={`/events/${event.kudago_id}`}
      className="group flex flex-col bg-white rounded-2xl shadow-md hover:shadow-xl transition-shadow overflow-hidden"
    >
      {/* Обложка */}
      <div className="relative w-full h-48 bg-gray-100 flex-shrink-0">
        {event.cover_url ? (
          <Image
            src={event.cover_url}
            alt={event.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M14 8h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
        {/* Бейдж: бесплатно / возраст */}
        <div className="absolute top-3 left-3 flex gap-2">
          {event.is_free && (
            <span className="bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded-full">
              Бесплатно
            </span>
          )}
          {ageLabel && (
            <span className="bg-gray-800 bg-opacity-70 text-white text-xs font-semibold px-2 py-1 rounded-full">
              {ageLabel}
            </span>
          )}
        </div>
      </div>

      {/* Контент */}
      <div className="flex flex-col flex-1 p-4 gap-2">
        {/* Категории */}
        {event.categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.categories.slice(0, 2).map((cat) => (
              <span
                key={cat}
                className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full capitalize"
              >
                {cat}
              </span>
            ))}
          </div>
        )}

        {/* Заголовок */}
        <h3 className="font-bold text-gray-900 text-base leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
          {event.title}
        </h3>

        {/* Дата */}
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span>{formatDate(event.start_date, event.start_time)}</span>
        </div>

        {/* Место */}
        {event.place_title && (
          <div className="flex items-start gap-1.5 text-sm text-gray-500">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span className="line-clamp-1">{event.place_title}</span>
          </div>
        )}

        {/* Цена — прибиваем к низу */}
        <div className="mt-auto pt-2 border-t border-gray-100">
          {event.is_free ? (
            <span className="text-green-600 font-semibold text-sm">Бесплатно</span>
          ) : event.price ? (
            <span className="text-gray-700 font-semibold text-sm">{event.price}</span>
          ) : (
            <span className="text-gray-400 text-sm">Цена не указана</span>
          )}
        </div>
      </div>
    </Link>
  );
}
