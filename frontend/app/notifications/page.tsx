'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsContext';

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
    case 'party_closed': return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
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
    case 'party_closed':           return { bg: 'var(--surface-2)',  color: 'var(--text-muted)' };
    default:                        return { bg: 'var(--primary-hl)', color: 'var(--primary)' };
  }
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  );
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead, isLoaded } = useNotifications();
  const router = useRouter();
  const [markingAll, setMarkingAll] = useState(false);

  const handleMarkRead = useCallback((id: number) => {
    markRead(id);
  }, [markRead]);

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAll(true);
    markAllRead();
    setMarkingAll(false);
  }, [markAllRead]);

  const handleNotificationClick = useCallback((id: number, data: string | null) => {
    handleMarkRead(id);
    let parsed: Record<string, unknown> = {};
    try { parsed = data ? JSON.parse(data) : {}; } catch { /* ignore parse errors */ }
    const partyId = parsed.party_id as number | undefined;
    if (partyId) router.push(`/parties/${partyId}`);
  }, [handleMarkRead, router]);

  if (!user) return null;

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
                {!isLoaded
                  ? 'Загрузка...'
                  : notifications.length === 0
                    ? 'Уведомлений нет'
                    : unreadCount > 0
                      ? `${unreadCount} непрочитанных`
                      : 'Всё прочитано'}
              </p>
            </div>
          </div>

          {unreadCount > 0 && isLoaded && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="text-sm px-4 py-2 rounded-xl font-medium transition"
              style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
            >
              {markingAll ? '...' : 'Прочитать все'}
            </button>
          )}
        </div>

        {/* ── Skeleton ── */}
        {!isLoaded && (
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
        {isLoaded && notifications.length === 0 && (
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
        {isLoaded && notifications.length > 0 && (
          <div className="space-y-2">
            {notifications.map(n => {
              const { bg, color } = typeAccentColor(n.type, n.is_read);
              let parsed: Record<string, unknown> = {};
              try { parsed = n.data ? JSON.parse(n.data) : {}; } catch { /* ignore parse errors */ }
              const partyId = parsed.party_id as number | undefined;
              const isClickable = !!partyId;

              return (
                <div
                  key={n.id}
                  onClick={() => isClickable && handleNotificationClick(n.id, n.data)}
                  className="rounded-2xl p-4 flex gap-3 transition-all"
                  style={{
                    background: 'var(--surface)',
                    border: n.is_read
                      ? '1px solid var(--border)'
                      : '1px solid color-mix(in srgb, ' + color + ' 40%, transparent)',
                    cursor: isClickable ? 'pointer' : 'default',
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

                  {/* Arrow if clickable */}
                  {isClickable && (
                    <div className="shrink-0 self-center" style={{ color: 'var(--text-faint)' }}>
                      <ArrowIcon />
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
