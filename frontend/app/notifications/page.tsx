'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/apiFetch';

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  data: string | null;
  is_read: boolean;
  created_at: string;
}

function typeIcon(type: string) {
  switch (type) {
    case 'request_status_changed': return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    );
    case 'kicked_from_party': return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    );
    case 'new_party_request': return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <line x1="19" y1="8" x2="19" y2="14"/>
        <line x1="22" y1="11" x2="16" y2="11"/>
      </svg>
    );
    default: return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    );
  }
}

function typeAccentColor(type: string, isRead: boolean): { bg: string; color: string } {
  if (isRead) return { bg: 'var(--surface-2)', color: 'var(--text-muted)' };
  switch (type) {
    case 'request_status_changed': return { bg: 'var(--success-hl)', color: 'var(--success)' };
    case 'kicked_from_party':      return { bg: 'var(--error-hl)',   color: 'var(--error)' };
    case 'new_party_request':      return { bg: 'var(--primary-hl)', color: 'var(--primary)' };
    default:                        return { bg: 'var(--primary-hl)', color: 'var(--primary)' };
  }
}

export default function NotificationsPage() {
  const { token, user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [items, setItems]       = useState<NotificationItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [marking, setMarking]   = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!token) { router.push('/login'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/notifications/?limit=100');
      if (!res.ok) throw new Error(`${res.status}`);
      const data: NotificationItem[] = await res.json();
      setItems(data);
    } catch {
      setError('Не удалось загрузить уведомления. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }, [token, authLoading, router]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: number) => {
    if (marking) return;
    setMarking(id);
    try {
      const res = await apiFetch('/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ notification_id: id }),
      });
      if (res.ok) {
        setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        // Notify navbar to decrement badge
        window.dispatchEvent(new CustomEvent('notification:read'));
      }
    } finally {
      setMarking(null);
    }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      const res = await apiFetch('/notifications/read-all', { method: 'POST' });
      if (res.ok) {
        setItems(prev => prev.map(n => ({ ...n, is_read: true })));
        window.dispatchEvent(new CustomEvent('notification:read-all'));
      }
    } finally {
      setMarkingAll(false);
    }
  };

  if (!user) return null;

  const unread = items.filter(n => !n.is_read).length;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      <main className="container mx-auto px-4 py-10 max-w-2xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--primary-hl)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="var(--primary)" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-black" style={{ color: 'var(--text)' }}>
                Уведомления
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {loading
                  ? 'Загрузка...'
                  : items.length === 0
                    ? 'Уведомлений нет'
                    : unread > 0
                      ? `${unread} непрочитанных`
                      : 'Всё прочитано'}
              </p>
            </div>
          </div>

          {unread > 0 && !loading && (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              className="text-sm px-4 py-2 rounded-xl font-medium transition"
              style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
            >
              {markingAll ? '...' : 'Прочитать все'}
            </button>
          )}
        </div>

        {/* ── Error ── */}
        {error && (
          <div
            className="rounded-2xl p-4 mb-6 text-sm"
            style={{ background: 'var(--error-hl)', color: 'var(--error)' }}
          >
            {error}
            <button onClick={load} className="ml-3 underline font-medium">Повторить</button>
          </div>
        )}

        {/* ── Skeleton ── */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div
                key={i}
                className="rounded-2xl p-5 animate-pulse"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div className="flex gap-3">
                  <div className="w-9 h-9 rounded-xl shrink-0" style={{ background: 'var(--surface-2)' }} />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 rounded" style={{ background: 'var(--surface-2)' }} />
                    <div className="h-3 w-60 rounded" style={{ background: 'var(--surface-2)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Empty ── */}
        {!loading && !error && items.length === 0 && (
          <div className="text-center py-24">
            <div
              className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{ background: 'var(--surface-2)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                stroke="var(--text-faint)" strokeWidth="1.5">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </div>
            <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Тихо!</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Уведомлений пока нет
            </p>
          </div>
        )}

        {/* ── Notification list ── */}
        {!loading && !error && items.length > 0 && (
          <div className="space-y-2">
            {items.map(n => {
              const { bg, color } = typeAccentColor(n.type, n.is_read);
              return (
                <div
                  key={n.id}
                  onClick={() => !n.is_read && markRead(n.id)}
                  className="rounded-2xl p-4 flex gap-3 transition-all"
                  style={{
                    background: n.is_read ? 'var(--surface)' : 'var(--surface)',
                    border: n.is_read
                      ? '1px solid var(--border)'
                      : '1px solid color-mix(in srgb, ' + color + ' 40%, transparent)',
                    cursor: n.is_read ? 'default' : 'pointer',
                    opacity: marking === n.id ? 0.6 : 1,
                  }}
                >
                  {/* Icon */}
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: bg, color }}
                  >
                    {typeIcon(n.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p
                        className="text-sm font-semibold"
                        style={{ color: n.is_read ? 'var(--text-muted)' : 'var(--text)' }}
                      >
                        {n.title}
                      </p>
                      {!n.is_read && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: color }}
                        />
                      )}
                    </div>
                    {n.body && (
                      <p
                        className="text-xs mt-0.5 leading-relaxed"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {n.body}
                      </p>
                    )}
                    <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
                      {new Date(n.created_at).toLocaleDateString('ru-RU', {
                        day: 'numeric', month: 'short',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>

                  {/* Mark-read hint */}
                  {!n.is_read && (
                    <div className="shrink-0 self-center">
                      <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                        Нажмите
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
