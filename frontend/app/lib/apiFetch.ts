/**
 * apiFetch — глобальный fetch-wrapper для GatherVibe.
 *
 * - В Docker все API-запросы идут через Next.js реврайты:
 *   /api/* → http://backend:8000/*
 *   /socket.io/* → http://backend:8000/socket.io/*
 * - В dev-режиме без Docker можно задать NEXT_PUBLIC_API_URL=http://localhost:8000
 *
 * Читает JWT из localStorage, добавляет Authorization: Bearer header.
 * При 401 очищает auth-данные, редиректит на /login.
 */

import { toast } from '../components/Toast';

/** Если задана NEXT_PUBLIC_API_URL (Docker = "/api", dev = "http://localhost:8000") */
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
