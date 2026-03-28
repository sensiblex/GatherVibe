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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser]   = useState<AuthUser | null>(null);

  // Читаем сессию из localStorage при монтировании
  useEffect(() => {
    const t = localStorage.getItem('token');
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

  // Слушаем кастомное событие auth:logout — реагируем в той же вкладке
  useEffect(() => {
    const onLogout = () => { setToken(null); setUser(null); };
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const login = useCallback((t: string, u: AuthUser) => {
    localStorage.setItem('token', t);
    localStorage.setItem('username', u.username);
    localStorage.setItem('email', u.email);
    setToken(t);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
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
