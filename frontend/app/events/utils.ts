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
};

/** Short month name in Russian for date badges */
export function shortMonth(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '');
}
