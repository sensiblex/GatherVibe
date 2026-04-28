// ─── Shared date helpers & constants for the events section ─────────────────

export function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localStartTs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(new Date(y, m - 1, d, 0, 0, 0).getTime() / 1000);
}

export function localEndTs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(new Date(y, m - 1, d, 23, 59, 59).getTime() / 1000);
}

export function displayDate(dateStr: string, opts: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', opts);
}

export const CATEGORY_RU: Record<string, string> = {
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
  'yarmarki-festivali': 'Ярмарки и фестивали',
  'yarmarki': 'Ярмарки', 'kvesty': 'Квесты',
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
  entertainment: 'Развлечения',
  stock: 'Акции', promo: 'Промо', discount: 'Скидки',
  'new-year': 'Новый год', halloween: 'Хэллоуин',
  recreation: 'Отдых', games: 'Игры',
  'rock-music': 'Рок', 'jazz-blues': 'Джаз / Блюз', jazz: 'Джаз',
  blues: 'Блюз', 'classical-music': 'Классика', classical: 'Классика',
  'electronic-music': 'Электронная музыка', electronic: 'Электронная музыка',
  'hip-hop': 'Хип-хоп', pop: 'Поп', 'pop-music': 'Поп', metal: 'Метал',
  folk: 'Фольк', reggae: 'Регги', 'r-n-b': 'R&B', soul: 'Соул',
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

/** Переводит slug категории/тега из KudaGo (или иной англ. строки) в русское
 *  название. Если перевод не найден — возвращает исходную строку с заглавной
 *  буквы (чтобы пользователю не показывался "сырой" lowercase-слаг). */
export function translateCategory(raw: unknown): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const hit = CATEGORY_RU[s.toLowerCase()];
  if (hit) return hit;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface EventCategoryBadge {
  slug: string;
  label: string;
  key: string;
}

export interface ScheduleEntry {
  weekday: number;
  from: string;
  to: string;
}

export interface ScheduleRow {
  label: string;
  time: string;
}

const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function extractSchedulesFromAllDates(allDates: unknown): ScheduleEntry[] {
  if (!Array.isArray(allDates)) return [];
  const schedules: ScheduleEntry[] = [];

  for (const dateEntry of allDates) {
    if (!dateEntry || typeof dateEntry !== 'object') continue;
    const rawSchedules = (dateEntry as { schedules?: unknown }).schedules;
    if (!Array.isArray(rawSchedules)) continue;

    for (const rawSchedule of rawSchedules) {
      if (!rawSchedule || typeof rawSchedule !== 'object') continue;
      const schedule = rawSchedule as {
        weekday?: unknown;
        days_of_week?: unknown;
        from?: unknown;
        to?: unknown;
        start_time?: unknown;
        end_time?: unknown;
      };
      const from = normalizeScheduleTime(schedule.from ?? schedule.start_time);
      const to = normalizeScheduleTime(schedule.to ?? schedule.end_time);

      if (Array.isArray(schedule.days_of_week)) {
        for (const rawWeekday of schedule.days_of_week) {
          const weekday = Number(rawWeekday);
          if (Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 && from && to) {
            schedules.push({ weekday, from, to });
          }
        }
        continue;
      }

      const weekday = Number(schedule.weekday);
      if (Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 && from && to) {
        schedules.push({ weekday, from, to });
      }
    }
  }

  return schedules;
}

function normalizeScheduleTime(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.length >= 5 ? value.slice(0, 5) : value;
}

export function usesPlaceSchedule(allDates: unknown): boolean {
  return Array.isArray(allDates) && allDates.some(dateEntry =>
    Boolean(dateEntry && typeof dateEntry === 'object' && (dateEntry as { use_place_schedule?: unknown }).use_place_schedule)
  );
}

export function formatPermanentScheduleLabel(event: {
  is_permanent?: boolean;
  all_dates?: unknown;
}): string | null {
  if (!event.is_permanent) return null;

  const schedules = extractSchedulesFromAllDates(event.all_dates);
  if (schedules.length > 0) {
    const first = schedules[0];
    const day = WEEKDAY_SHORT[first.weekday] ?? '';
    const suffix = schedules.length > 1 ? ` +${schedules.length - 1}` : '';
    return `${day} ${first.from}-${first.to}${suffix}`.trim();
  }

  if (usesPlaceSchedule(event.all_dates)) {
    return 'По расписанию места';
  }

  return null;
}

export function groupPermanentScheduleRows(entries: ScheduleEntry[]): ScheduleRow[] {
  const byTime = new Map<string, Set<number>>();

  for (const entry of entries) {
    if (!Number.isInteger(entry.weekday) || entry.weekday < 0 || entry.weekday > 6 || !entry.from || !entry.to) {
      continue;
    }
    const key = `${entry.from}-${entry.to}`;
    const days = byTime.get(key) ?? new Set<number>();
    days.add(entry.weekday);
    byTime.set(key, days);
  }

  return [...byTime.entries()]
    .map(([time, days]) => ({
      label: formatWeekdayRanges([...days].sort((a, b) => a - b)),
      time,
      firstDay: Math.min(...days),
    }))
    .sort((a, b) => a.firstDay - b.firstDay || a.time.localeCompare(b.time))
    .map(({ label, time }) => ({ label, time }));
}

function formatWeekdayRanges(days: number[]): string {
  const ranges: string[] = [];
  let start = days[0];
  let prev = days[0];

  for (let i = 1; i <= days.length; i += 1) {
    const day = days[i];
    if (day === prev + 1) {
      prev = day;
      continue;
    }

    if (start === prev) {
      ranges.push(WEEKDAY_SHORT[start] ?? '');
    } else if (prev === start + 1) {
      ranges.push(WEEKDAY_SHORT[start] ?? '', WEEKDAY_SHORT[prev] ?? '');
    } else {
      ranges.push(`${WEEKDAY_SHORT[start] ?? ''}-${WEEKDAY_SHORT[prev] ?? ''}`);
    }

    start = day;
    prev = day;
  }

  return ranges.filter(Boolean).join(', ');
}

export function getEventCategoryBadges(categories: unknown, limit = 2): EventCategoryBadge[] {
  if (!Array.isArray(categories)) return [];

  return categories
    .map((category, index): EventCategoryBadge | null => {
      if (typeof category === 'string' || typeof category === 'number') {
        const slug = String(category).trim();
        const label = translateCategory(slug);
        return slug && label ? { slug, label, key: `${slug}-${index}` } : null;
      }

      if (category && typeof category === 'object') {
        const value = category as { slug?: unknown; name?: unknown; id?: unknown };
        const slug = String(value.slug ?? value.name ?? value.id ?? '').trim();
        const label = translateCategory(value.name ?? value.slug ?? value.id ?? '');
        return slug && label ? { slug, label, key: `${slug}-${index}` } : null;
      }

      return null;
    })
    .filter((category): category is EventCategoryBadge => category !== null)
    .slice(0, limit);
}

/** Short month name in Russian for date badges */
export function shortMonth(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '');
}
