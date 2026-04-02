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
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  login: () => {},
  logout: () => {},
});

/** Cookie helpers ---------------------------------------------------------- */

function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0`;
}

function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Provider ---------------------------------------------------------------- */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser]   = useState<AuthUser | null>(null);

  // Initialise from cookie (primary source) or fall back to localStorage
  useEffect(() => {
    const t = getCookieValue('token') ?? localStorage.getItem('token');
    if (t) {
      try {
        const p = JSON.parse(atob(t.split('.')[1]));
        setToken(t);
        setUser({ id: p.id ?? p.user_id, username: p.username, email: p.sub });
      } catch {}
    }
  }, []);

  // Слушаем storage-событие — реагируем на логаут из другой вкладки
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'token' && !e.newValue) {
        setToken(null);
        setUser(null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /**
   * Слушаем кастомное событие auth:logout.
   * Диспатчится:
   *  - вручную через logout() из того же контекста
   *  - автоматически через apiFetch при получении HTTP 401
   */
  useEffect(() => {
    const onLogout = () => { setToken(null); setUser(null); };
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const login = useCallback((t: string, u: AuthUser) => {
    // Persist to cookie (7 days) so the Next.js middleware can read it server-side
    setCookie('token', t, 604800);
    // Keep localStorage as a fallback for client-side reads
    localStorage.setItem('token', t);
    localStorage.setItem('username', u.username);
    localStorage.setItem('email', u.email);
    setToken(t);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    // Clear both the cookie and localStorage
    deleteCookie('token');
    ['token', 'user_id', 'username', 'email'].forEach(k => localStorage.removeItem(k));
    setToken(null);
    setUser(null);
    // Бросаем событие — все компоненты на странице реагируют мгновенно
    window.dispatchEvent(new Event('auth:logout'));
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
