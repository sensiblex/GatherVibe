/**
 * Единый каталог интересов GatherVibe.
 * Используется на странице регистрации и профиля.
 * ID интересов хранятся в БД как строка через запятую без пробелов: "concert,cinema,yoga"
 */

export const INTERESTS_LIST: { id: string; label: string }[] = [
  { id: 'concert',    label: '🎵 Концерты'         },
  { id: 'theater',    label: '🎭 Театр'             },
  { id: 'exhibition', label: '🖼 Выставки'          },
  { id: 'cinema',     label: '🎬 Кино'              },
  { id: 'standup',    label: '🎤 Стендап'           },
  { id: 'sport',      label: '⚽ Спорт'             },
  { id: 'festival',   label: '🎪 Фестивали'         },
  { id: 'quest',      label: '🗺 Квесты'            },
  { id: 'gastro',     label: '🍽 Гастрономия'       },
  { id: 'nature',     label: '🌿 Природа'           },
  { id: 'gaming',     label: '🎮 Игры'              },
  { id: 'art',        label: '🎨 Мастер-классы'     },
  { id: 'science',    label: '🔬 Наука'             },
  { id: 'dance',      label: '💃 Танцы'             },
  { id: 'travel',     label: '✈️ Путешествия'      },
  { id: 'photo',      label: '📷 Фотография'        },
  { id: 'books',      label: '📚 Книги/Лектории'    },
  { id: 'yoga',       label: '🧘 Йога'              },
];

/** Список ID для итерации */
export const INTEREST_IDS = INTERESTS_LIST.map(i => i.id);

/** Маппинг id → читаемый label с эмодзи */
export const INTEREST_LABEL_MAP: Record<string, string> = Object.fromEntries(
  INTERESTS_LIST.map(i => [i.id, i.label])
);

/**
 * Возвращает label для переданного id.
 * Если id неизвестен (напр., старые данные из БД) — возвращает сам id как fallback.
 */
export function getInterestLabel(id: string): string {
  return INTEREST_LABEL_MAP[id] ?? id;
}
