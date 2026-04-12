'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface AuthUser {
  id: number;
  username: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
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

/** Выставляет cookie, которую читает proxy.ts на сервере (не HttpOnly — нужна только для SSR-редиректов) */
function setProxyCookie(value: string) {
  document.cookie = `token=${encodeURIComponent(value)}; path=/; max-age=604800; SameSite=Lax`;
}

function clearProxyCookie() {
  document.cookie = 'token=; path=/; max-age=0';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken]       = useState<string | null>(null);
  const [user, setUser]         = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Восстанавливаем сессию из localStorage при монтировании
  useEffect(() => {
    const t = localStorage.getItem('token');
    if (t) {
      try {
        const p = JSON.parse(atob(t.split('.')[1]));
        setToken(t);
        setUser({ id: p.id ?? p.user_id, username: p.username, email: p.sub });
      } catch {
        localStorage.removeItem('token');
      }
    }
    setIsLoading(false);
  }, []);

  // Логаут из другой вкладки
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'token' && !e.newValue) { setToken(null); setUser(null); }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Логаут по событию от apiFetch (401)
  useEffect(() => {
    const onLogout = () => { setToken(null); setUser(null); };
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const login = useCallback((t: string, u: AuthUser) => {
    localStorage.setItem('token', t);
    localStorage.setItem('username', u.username);
    localStorage.setItem('email', u.email);
    // Эту cookie читает proxy.ts для SSR-защиты маршрутов
    setProxyCookie(t);
    setToken(t);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    // Просим сервер очистить HttpOnly cookie (если есть)
    await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    localStorage.removeItem('token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
    localStorage.removeItem('email');
    clearProxyCookie();
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
