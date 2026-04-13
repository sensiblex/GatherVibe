'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('gv-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = stored ? stored === 'dark' : prefersDark;
    setDark(isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    const theme = next ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gv-theme', theme);
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Светлая тема' : 'Тёмная тема'}
      className="relative w-9 h-9 flex items-center justify-center rounded-xl transition"
      style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
    >
      {dark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5"/>
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

export default function Navbar() {
  const { user, logout, token } = useAuth();
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;
  const [unreadCount, setUnreadCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const fetchUnread = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.count === 'number') setUnreadCount(data.count);
      }
    } catch {}
  }, [token]);

  // Загружаем аватар пользователя один раз при авторизации
  useEffect(() => {
    if (!token) { setAvatarUrl(null); return; }
    // Сначала читаем из localStorage (быстро, без запроса)
    const cached = localStorage.getItem('avatar_url');
    if (cached) setAvatarUrl(cached);
    // Затем синхронизируем с сервером
    fetch(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const url: string | null = data?.avatar_url ?? null;
        setAvatarUrl(url);
        if (url) localStorage.setItem('avatar_url', url);
        else localStorage.removeItem('avatar_url');
      })
      .catch(() => {});
  }, [token]);

  // Обновляем аватар когда пользователь меняет его на странице профиля
  useEffect(() => {
    const onAvatarUpdated = () => {
      const url = localStorage.getItem('avatar_url');
      setAvatarUrl(url);
    };
    window.addEventListener('avatar:updated', onAvatarUpdated);
    return () => window.removeEventListener('avatar:updated', onAvatarUpdated);
  }, []);

  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, 30_000);
    return () => clearInterval(id);
  }, [fetchUnread]);

  // Sync badge with mark-read and new-notification events
  useEffect(() => {
    const onNew     = () => setUnreadCount(c => c + 1);
    const onRead    = () => setUnreadCount(c => Math.max(0, c - 1));
    const onReadAll = () => setUnreadCount(0);
    window.addEventListener('notification:new',      onNew);
    window.addEventListener('notification:read',     onRead);
    window.addEventListener('notification:read-all', onReadAll);
    return () => {
      window.removeEventListener('notification:new',      onNew);
      window.removeEventListener('notification:read',     onRead);
      window.removeEventListener('notification:read-all', onReadAll);
    };
  }, []);

  return (
    <nav
      className="sticky top-0 z-50 backdrop-blur-lg border-b transition"
      style={{
        background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
        borderColor: 'var(--divider)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="GatherVibe">
            <circle cx="14" cy="14" r="13" fill="var(--primary)" opacity="0.15"/>
            <circle cx="10" cy="13" r="4" fill="var(--primary)"/>
            <circle cx="18" cy="13" r="4" fill="var(--primary)" opacity="0.6"/>
            <path d="M6 20c0-2.21 1.79-4 4-4h8c2.21 0 4 1.79 4 4" stroke="var(--primary)" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
          </svg>
          <span className="text-lg font-black gradient-text">GatherVibe</span>
        </Link>

        {/* Nav links */}
        <div className="hidden sm:flex items-center gap-1">
          <Link
            href="/events"
            className="px-4 py-2 rounded-xl text-sm font-medium transition"
            style={{
              background: isActive('/events') ? 'var(--primary-hl)' : 'transparent',
              color: isActive('/events') ? 'var(--primary)' : 'var(--text-muted)',
            }}
          >
            События
          </Link>
          {user && (
            <Link
              href="/parties"
              className="px-4 py-2 rounded-xl text-sm font-medium transition"
              style={{
                background: pathname.startsWith('/parties') ? 'var(--primary-hl)' : 'transparent',
                color: pathname.startsWith('/parties') ? 'var(--primary)' : 'var(--text-muted)',
              }}
            >
              Компании
            </Link>
          )}
          {user && (
            <Link
              href="/my-events"
              className="px-4 py-2 rounded-xl text-sm font-medium transition"
              style={{
                background: isActive('/my-events') ? 'var(--primary-hl)' : 'transparent',
                color: isActive('/my-events') ? 'var(--primary)' : 'var(--text-muted)',
              }}
            >
              Мои события
            </Link>
          )}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          {user ? (
            <>
              {/* ── Bell → /notifications ── */}
              <Link
                href="/notifications"
                className="relative w-9 h-9 flex items-center justify-center rounded-xl transition"
                style={{
                  background: isActive('/notifications') ? 'var(--primary-hl)' : 'var(--surface-2)',
                  color: isActive('/notifications') ? 'var(--primary)' : 'var(--text-muted)',
                }}
                title="Уведомления"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {unreadCount > 0 && (
                  <span className="gv-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </Link>

              <span className="hidden sm:block text-sm" style={{ color: 'var(--text-muted)' }}>
                Привет,{' '}
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{user.username}</span>!
              </span>

              {/* ── Профиль с аватаром ── */}
              <Link
                href="/profile"
                className="flex items-center gap-1.5 text-sm font-medium px-2 py-1.5 rounded-xl transition"
                style={{
                  color: isActive('/profile') ? 'var(--text-inverse)' : 'var(--primary)',
                  background: isActive('/profile') ? 'var(--primary)' : 'var(--primary-hl)',
                }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={user.username}
                    className="w-6 h-6 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0"
                    style={{
                      background: isActive('/profile')
                        ? 'rgba(255,255,255,0.25)'
                        : 'linear-gradient(135deg, var(--primary), #a855f7)',
                      color: '#fff',
                    }}
                  >
                    {user.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
                Профиль
              </Link>

              <button
                onClick={logout}
                className="text-sm px-3 py-1.5 rounded-xl font-medium transition"
                style={{ color: 'var(--error)', background: 'var(--error-hl)' }}
              >
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium transition" style={{ color: 'var(--text-muted)' }}>
                Войти
              </Link>
              <Link href="/register" className="gv-btn-primary text-sm px-4 py-2">
                Регистрация
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
