/**
 * apiFetch — глобальный fetch-wrapper для GatherVibe.
 *
 * - В Docker все API-запросы идут через Next.js реврайты:
 *   /api/* → http://backend:8000/*
 *   /socket.io/* → http://backend:8000/socket.io/*
 * - В dev-режиме без Docker можно задать NEXT_PUBLIC_API_URL=http://localhost:8000
 *
 * Аутентификация — только через HttpOnly cookie `token` (ставится backend'ом при /login).
 * Все запросы идут с `credentials: 'include'`, чтобы браузер сам прикреплял cookie.
 * В localStorage токен НЕ кладётся — защищает от XSS (его JS просто не может прочитать).
 */

import { toast } from '../components/Toast';
import { resolveApiBase } from './apiBase';

/** Если задана NEXT_PUBLIC_API_URL (Docker = "/api", dev = "http://localhost:8000") */
const API_BASE = resolveApiBase();

function clearAuth(): void {
  // localStorage уже не хранит token, но могли остаться кэши от старых версий.
  ['token', 'user_id', 'username', 'email', 'email_notifications'].forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  });
  window.dispatchEvent(new Event('auth:logout'));
}

function handle401(): void {
  clearAuth();
  toast('Сессия истекла, войдите снова', 'error');
  window.location.replace('/login');
}

export interface ApiFetchOptions extends RequestInit {
  /** Если true — 401 не триггерит глобальный редирект на /login.
   * Используй на самой странице логина, чтобы ошибка входа не крутилась в цикле. */
  skipAuthRedirect?: boolean;
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: ApiFetchOptions = {},
): Promise<Response> {
  let url: RequestInfo | URL = input;
  if (typeof input === 'string' && input.startsWith('/')) {
    // Если путь уже начинается с API_BASE (/api или http://...), не дублируем
    if (API_BASE && (
      input.startsWith(API_BASE + '/') ||
      (API_BASE.startsWith('/') && input.startsWith(API_BASE))
    )) {
      url = input;
    } else {
      url = `${API_BASE}${input}`;
    }
  }

  const { skipAuthRedirect, ...fetchInit } = init;
  const headers = new Headers(fetchInit.headers);

  // Cookie-based auth: браузер сам отправит HttpOnly `token`.
  // `credentials: 'include'` нужен при cross-origin (dev-режим без Docker).
  let response = await fetch(url, {
    ...fetchInit,
    headers,
    credentials: fetchInit.credentials ?? 'include',
  });

  if (response.status === 401 && !skipAuthRedirect) {
    handle401();
    return response;
  }

  // Detect ban response and redirect to /banned screen
  if (response.status === 403) {
    try {
      const cloned = response.clone();
      const body = await cloned.json();
      const detail = body?.detail;
      if (detail && typeof detail === 'object' && detail.code === 'banned') {
        const until = detail.banned_until ? encodeURIComponent(detail.banned_until) : '';
        const reason = detail.reason ? encodeURIComponent(detail.reason) : '';
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/banned')) {
          window.location.replace(`/banned?until=${until}&reason=${reason}`);
        }
      }
    } catch { /* ignore */ }
  }

  return response;
}
