'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiFetch } from '../lib/apiFetch';

export type UserRole = 'user' | 'moderator' | 'admin';

interface AuthUser {
  id: number;
  username: string;
  email: string;
  email_notifications?: boolean;
  role?: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** DEPRECATED: токен больше не читается из JS. Оставлено как сигнал залогиненности для UI. */
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isLoading: true,
  login: () => {},
  logout: () => {},
});

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function AuthProvider({ children }: { children: ReactNode }) {
  // `token` держим как маркер (truthy/null) — реальный JWT в HttpOnly cookie.
  const [token, setToken]       = useState<string | null>(null);
  const [user, setUser]         = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // При монтировании пробуем получить профиль через /users/me.
  // Если cookie валидна — сервер вернёт 200, знач мы залогинены.
  useEffect(() => {
    let cancelled = false;
    // cleanup legacy localStorage (старые версии клали токен туда)
    try { localStorage.removeItem('token'); } catch { /* ignore */ }
    apiFetch('/users/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setToken('session');  // маркер "залогинен"
        setUser({
          id: data.id,
          username: data.username,
          email: data.email,
          email_notifications: data.email_notifications,
          role: (data.role as UserRole) || 'user',
        });
      })
      .catch(() => { /* ignore — аноним */ })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Логаут по событию от apiFetch (401)
  useEffect(() => {
    const onLogout = () => { setToken(null); setUser(null); };
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const login = useCallback((_t: string, u: AuthUser) => {
    // Токен пришёл в HttpOnly cookie (backend делает set_cookie).
    // Локально только обновляем React state — JWT в JS не трогаем.
    setToken('session');
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    // Сервер удалит HttpOnly cookie и добавит jti в blacklist.
    await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    // legacy-ключи (на случай апгрейда со старой версии фронта)
    ['token', 'user_id', 'username', 'email', 'email_notifications'].forEach((k) => {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    });
    setToken(null);
    setUser(null);
    window.dispatchEvent(new Event('auth:logout'));
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
