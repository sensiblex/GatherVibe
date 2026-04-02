'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/apiFetch';

const API_BASE    = process.env.NEXT_PUBLIC_API_URL    || 'http://localhost:8000';
const SOCKET_URL  = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:8000';

interface PendingRequest {
  id: number;
  user_id: number;
  username: string;
  party_id: number;
  event_title?: string;
  created_at?: string;
  isNew?: boolean; // flash indicator for real-time arrivals
}

interface NewPartyRequestPayload {
  party_id: number;
  party_title: string;
  user_id: number;
  username: string;
}

export default function NotificationsPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [requests, setRequests]     = useState<PendingRequest[]>([]);
  const [loading, setLoading]       = useState(true);
  const [acting, setActing]         = useState<number | null>(null);
  const [liveCount, setLiveCount]   = useState(0); // count of real-time arrivals
  const socketRef = useRef<Socket | null>(null);

  // ── Initial HTTP load ──────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!token) { router.push('/login'); return; }
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/parties/my-pending-requests`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [token, router]);

  useEffect(() => { load(); }, [load]);

  // ── Socket.IO — connect only on this page, disconnect on unmount ───────────
  useEffect(() => {
    if (!user?.id) return;

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('subscribe_notifications', { userId: user.id });
    });

    socket.on('new_party_request', (payload: NewPartyRequestPayload) => {
      const newRequest: PendingRequest = {
        // Use a temporary negative id so it doesn't clash with real DB ids
        // before the creator approves/rejects (page refresh would fix it)
        id: -(Date.now()),
        user_id: payload.user_id,
        username: payload.username,
        party_id: payload.party_id,
        event_title: payload.party_title,
        created_at: new Date().toISOString(),
        isNew: true,
      };
      setRequests(prev => [newRequest, ...prev]);
      setLiveCount(c => c + 1);

      // Remove flash after 3 s
      setTimeout(() => {
        setRequests(prev =>
          prev.map(r => r.id === newRequest.id ? { ...r, isNew: false } : r)
        );
      }, 3000);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const respond = async (requestId: number, action: 'approve' | 'reject') => {
    if (!token) return;
    // Real-time cards have negative ids — can't call API until page refresh
    // gives them a real id; just remove them from UI optimistically.
    if (requestId < 0) {
      setRequests(prev => prev.filter(r => r.id !== requestId));
      return;
    }
    setActing(requestId);
    try {
      await apiFetch(`${API_BASE}/parties/requests/${requestId}/${action}`, {
        method: 'POST',
      });
      setRequests(prev => prev.filter(r => r.id !== requestId));
    } catch {}
    finally { setActing(null); }
  };

  if (!user) return null;

  const totalCount = requests.length;
  const pluralLabel = totalCount === 1 ? 'заявка' : totalCount < 5 ? 'заявки' : 'заявок';

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      <main className="container mx-auto px-4 py-10 max-w-2xl">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 mb-8">
          <div className="relative">
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
            {liveCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full
                           flex items-center justify-center text-[10px] font-black text-white
                           animate-bounce"
                style={{ background: 'var(--error)' }}
              >
                {liveCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-xl font-black" style={{ color: 'var(--text)' }}>Уведомления</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {loading
                ? 'Загрузка...'
                : totalCount === 0
                  ? 'Новых заявок нет'
                  : `${totalCount} ${pluralLabel} на вступление`}
            </p>
          </div>
        </div>

        {/* ── Live-connection indicator ── */}
        <div className="flex items-center gap-1.5 mb-6">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: socketRef.current?.connected ? 'var(--success)' : 'var(--text-faint)' }}
          />
          <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
            {socketRef.current?.connected ? 'Подключено — уведомления в реальном времени' : 'Подключение...'}
          </span>
        </div>

        {/* ── Skeleton ── */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl p-5 animate-pulse"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex justify-between items-center">
                  <div className="space-y-2">
                    <div className="h-4 w-32 rounded" style={{ background: 'var(--surface-2)' }} />
                    <div className="h-3 w-48 rounded" style={{ background: 'var(--surface-2)' }} />
                  </div>
                  <div className="flex gap-2">
                    <div className="h-9 w-20 rounded-xl" style={{ background: 'var(--surface-2)' }} />
                    <div className="h-9 w-20 rounded-xl" style={{ background: 'var(--surface-2)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && totalCount === 0 && (
          <div className="text-center py-24">
            <div className="text-6xl mb-4">🔔</div>
            <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Всё чисто!</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Новых заявок на вступление в компанию нет
            </p>
          </div>
        )}

        {/* ── Request list ── */}
        {!loading && totalCount > 0 && (
          <div className="space-y-3">
            {requests.map(req => (
              <div
                key={req.id}
                className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
                style={{
                  background: req.isNew ? 'var(--primary-hl)' : 'var(--surface)',
                  border: req.isNew
                    ? '1px solid var(--primary)'
                    : '1px solid var(--border)',
                  boxShadow: req.isNew ? '0 0 0 3px var(--primary-hl)' : 'var(--shadow-sm)',
                  transition: 'background 0.6s ease, border-color 0.6s ease, box-shadow 0.6s ease',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shrink-0"
                    style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
                  >
                    {req.username?.slice(0, 2).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                        {req.username}
                      </p>
                      {req.isNew && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: 'var(--primary)', color: 'var(--text-inverse)' }}
                        >
                          НОВАЯ
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      хочет вступить{req.event_title ? ` · ${req.event_title}` : ''}
                    </p>
                    {req.created_at && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                        {new Date(req.created_at).toLocaleDateString('ru-RU', {
                          day: 'numeric', month: 'short',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    disabled={acting === req.id}
                    onClick={() => respond(req.id, 'approve')}
                    className="px-4 py-2 rounded-xl text-sm font-semibold transition"
                    style={{ background: 'var(--success-hl)', color: 'var(--success)' }}
                  >
                    {acting === req.id ? '...' : '✓ Принять'}
                  </button>
                  <button
                    disabled={acting === req.id}
                    onClick={() => respond(req.id, 'reject')}
                    className="px-4 py-2 rounded-xl text-sm font-semibold transition"
                    style={{ background: 'var(--error-hl)', color: 'var(--error)' }}
                  >
                    {acting === req.id ? '...' : '✕ Отклонить'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
