/**
 * apiFetch — глобальный fetch-wrapper для GatherVibe.
 *
 * - Читает JWT из localStorage, добавляет Authorization: Bearer header.
 * - При 401 очищает auth-данные, редиректит на /login.
 */

import { toast } from '../components/Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem('token'); } catch { return null; }
}

function clearAuth(): void {
  ['token', 'user_id', 'username', 'email'].forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  });
  document.cookie = 'token=; path=/; max-age=0';
  window.dispatchEvent(new Event('auth:logout'));
}

function handle401(): void {
  clearAuth();
  toast('Сессия истекла, войдите снова', 'error');
  window.location.replace('/login');
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  let url: RequestInfo | URL = input;
  if (typeof input === 'string' && input.startsWith('/')) {
    url = `${API_BASE}${input}`;
  }

  const headers = new Headers(init.headers);
  if (!headers.has('Authorization')) {
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, { ...init, headers });

  if (response.status === 401) {
    handle401();
    return response;
  }

  return response;
}
