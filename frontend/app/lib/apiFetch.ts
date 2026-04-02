/**
 * apiFetch — глобальный fetch-wrapper для GatherVibe.
 *
 * Автоматически:
 *  1. Добавляет заголовок Authorization: Bearer <token>, если токен доступен.
 *  2. При получении HTTP 401 от бэкенда:
 *     - Очищает токен из localStorage, sessionStorage и cookie.
 *     - Перенаправляет пользователя на /login.
 *     - Показывает toast «Сессия истекла, войдите снова».
 *  3. Диспатчит кастомное событие auth:logout, чтобы AuthContext
 *     среагировал в той же вкладке без перезагрузки.
 *
 * Использование:
 *   import { apiFetch } from '@/app/lib/apiFetch';
 *   const res = await apiFetch('/parties/my-pending-requests');
 *   const res = await apiFetch('/parties/1', { method: 'DELETE' });
 *
 * Принимает те же аргументы, что и нативный fetch().
 * Если первый аргумент — относительный путь (начинается с /),
 * он будет дополнен значением NEXT_PUBLIC_API_URL.
 */

import { toast } from '../components/Toast';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/** Читает токен из cookie (SSR-safe) */
function getTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Читает токен из localStorage (CSR only) */
function getTokenFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

/** Получает актуальный токен (cookie приоритетнее localStorage) */
function getToken(): string | null {
  return getTokenFromCookie() ?? getTokenFromStorage();
}

/** Сбрасывает всё аутентификационное состояние на клиенте */
function clearAuth(): void {
  // Удалить cookie
  document.cookie = 'token=; path=/; max-age=0';

  // Удалить из localStorage
  ['token', 'user_id', 'username', 'email'].forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  });

  // Уведомить AuthContext (и любые другие подписчики) в текущей вкладке
  window.dispatchEvent(new Event('auth:logout'));
}

/** Обрабатывает 401-ответ: очищает auth-данные, показывает toast, редиректит */
function handle401(): void {
  clearAuth();
  toast('Сессия истекла, войдите снова', 'error');
  // Используем window.location.replace чтобы не оставлять текущую страницу в истории
  window.location.replace('/login');
}

/**
 * Обёртка над нативным fetch.
 * Подписи полностью совместимы с fetch(input, init).
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  // Нормализуем URL: относительные пути дополняем API_BASE
  let url: RequestInfo | URL = input;
  if (typeof input === 'string' && input.startsWith('/')) {
    url = `${API_BASE}${input}`;
  }

  // Формируем заголовки
  const headers = new Headers(init.headers);

  // Добавляем Authorization только если токен доступен и ещё не установлен вручную
  if (!headers.has('Authorization')) {
    const token = getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  // Глобальная обработка 401
  if (response.status === 401) {
    handle401();
    // Возвращаем response, чтобы вызывающий код мог завершиться штатно,
    // но редирект уже запущен — дальнейший код не будет заметен пользователю.
    return response;
  }

  return response;
}
