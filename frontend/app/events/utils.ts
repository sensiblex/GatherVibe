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
