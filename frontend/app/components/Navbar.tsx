'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiFetch';
import NavbarInvitesDropdown from './NavbarInvitesDropdown';
import { resolveApiBase } from '../lib/apiBase';

const API_BASE = resolveApiBase();

function toMediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path}`;
}

function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('gv-theme');
    const isDark = stored ? stored === 'dark' : true;
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
    <button id="themeBtn" onClick={toggle} aria-label="Переключить тему">
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="5" />
          <g strokeLinecap="round">
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </g>
        </svg>
      )}
    </button>
  );
}

export default function Navbar() {
  const { user, logout, token } = useAuth();
  const { unreadCount } = useNotifications();
  const pathname = usePathname();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!token) { setAvatarUrl(null); return; }
    const cached = localStorage.getItem('avatar_url');
    if (cached) setAvatarUrl(cached);
    apiFetch(`${API_BASE}/users/me`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const url: string | null = data?.avatar_url ?? null;
        setAvatarUrl(url);
        if (url) localStorage.setItem('avatar_url', url);
        else localStorage.removeItem('avatar_url');
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    const onAvatarUpdated = () => {
      const url = localStorage.getItem('avatar_url');
      setAvatarUrl(url);
    };
    window.addEventListener('avatar:updated', onAvatarUpdated);
    return () => window.removeEventListener('avatar:updated', onAvatarUpdated);
  }, []);

  const isActive = (href: string) => pathname === href;
  const isPartiesActive = pathname.startsWith('/parties');

  return (
    <>
      <ThemeToggle />
      <nav className={`navbar${scrolled ? ' scrolled' : ''}`}>
        <div className="navbar-inner">

          <Link href="/" className="logo">
            <svg width="22" height="16" viewBox="0 0 22 16" fill="none" aria-hidden="true">
              <circle cx="6"  cy="8" r="6" fill="var(--ink)" />
              <circle cx="16" cy="8" r="6" fill="var(--ink)" opacity=".38" />
            </svg>
            GatherVibe
          </Link>

          <div className="nav-links">
            <Link href="/events" className={`nav-link${isActive('/events') ? ' active' : ''}`}>События</Link>
            {user && (
              <Link href="/parties" className={`nav-link${isPartiesActive ? ' active' : ''}`}>Компании</Link>
            )}
            {user && (
              <Link href="/my-events" className={`nav-link${isActive('/my-events') ? ' active' : ''}`}>Мои события</Link>
            )}
            {user && user.role && user.role !== 'user' && (
              <Link
                href="/admin"
                className={`nav-link${pathname.startsWith('/admin') ? ' active' : ''}`}
                data-testid="nav-admin"
              >
                Модерация
              </Link>
            )}
          </div>

          <div className="nav-right">
            {user ? (
              <>
                <NavbarInvitesDropdown />
                <div className="notif-wrap">
                  <Link href="/notifications" className="icon-btn" aria-label="Уведомления">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </Link>
                  {unreadCount > 0 && <div className="notif-dot" />}
                </div>

                <Link href="/profile" aria-label={user.username} style={{ display: 'inline-flex' }}>
                  {avatarUrl ? (
                    <img
                      src={toMediaUrl(avatarUrl) || undefined}
                      alt={user.username}
                      style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div className="av av-sm" style={{ width: 32, height: 32, fontSize: '.8125rem' }}>
                      {user.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </Link>

                <button onClick={logout} className="btn btn-ghost btn-sm" style={{ color: 'var(--match)' }}>
                  Выйти
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="nav-link">Войти</Link>
                <Link href="/register" className="btn btn-ink btn-sm">Регистрация</Link>
              </>
            )}
          </div>

        </div>
      </nav>
    </>
  );
}
