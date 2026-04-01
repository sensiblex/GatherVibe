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
      className="relative w-9 h-9 flex items-center justify-center rounded-xl transition hover:opacity-80"
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
  const [pendingCount, setPendingCount] = useState(0);

  const fetchPending = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/parties/my-pending-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // data может быть массивом заявок или { count: N }
        if (Array.isArray(data)) setPendingCount(data.length);
        else if (typeof data.count === 'number') setPendingCount(data.count);
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    fetchPending();
    const id = setInterval(fetchPending, 30_000);
    return () => clearInterval(id);
  }, [fetchPending]);

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-lg border-b transition"
      style={{
        background: 'color-mix(in srgb, var(--surface) 85%, transparent)',
        borderColor: 'var(--divider)',
        boxShadow: 'var(--shadow-sm)',
      }}>
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
          <Link href="/events"
            className="px-4 py-2 rounded-xl text-sm font-medium transition"
            style={{
              background: isActive('/events') ? 'var(--primary-hl)' : 'transparent',
              color: isActive('/events') ? 'var(--primary)' : 'var(--text-muted)',
            }}>
            События
          </Link>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <ThemeToggle />

          {user ? (
            <>
              {/* Notification bell */}
              <Link href="/profile" className="relative w-9 h-9 flex items-center justify-center rounded-xl transition"
                style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                title="Заявки в мои компании">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {pendingCount > 0 && (
                  <span className="gv-badge">{pendingCount > 9 ? '9+' : pendingCount}</span>
                )}
              </Link>

              <span className="hidden sm:block text-sm" style={{ color: 'var(--text-muted)' }}>
                Привет,{' '}
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{user.username}</span>!
              </span>
              <Link href="/profile"
                className="text-sm font-medium px-3 py-1.5 rounded-xl transition"
                style={{ color: 'var(--primary)', background: 'var(--primary-hl)' }}>
                Профиль
              </Link>
              <button onClick={logout}
                className="text-sm px-3 py-1.5 rounded-xl font-medium transition"
                style={{ color: 'var(--error)', background: 'var(--error-hl)' }}>
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link href="/login"
                className="text-sm font-medium transition"
                style={{ color: 'var(--text-muted)' }}>
                Войти
              </Link>
              <Link href="/register"
                className="gv-btn-primary text-sm px-4 py-2">
                Регистрация
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
