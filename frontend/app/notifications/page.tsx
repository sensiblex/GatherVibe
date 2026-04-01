'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface PendingRequest {
  id: number;
  user_id: number;
  username: string;
  party_id: number;
  event_title?: string;
  created_at?: string;
}

export default function NotificationsPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [acting, setActing]     = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) { router.push('/login'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/parties/my-pending-requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

  const respond = async (requestId: number, action: 'approve' | 'reject') => {
    if (!token) return;
    setActing(requestId);
    try {
      await fetch(`${API_BASE}/parties/requests/${requestId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setRequests(prev => prev.filter(r => r.id !== requestId));
    } catch {}
    finally { setActing(null); }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      <main className="container mx-auto px-4 py-10 max-w-2xl">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--primary-hl)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="var(--primary)" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-black" style={{ color: 'var(--text)' }}>Уведомления</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {loading ? 'Загрузка...' : requests.length === 0
                ? 'Новых заявок нет'
                : `${requests.length} заявк${requests.length === 1 ? 'а' : requests.length < 5 ? 'и' : ''} на вступление`}
            </p>
          </div>
        </div>

        {loading ? (
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
        ) : requests.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-6xl mb-4">🔔</div>
            <p className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Всё чисто!</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Новых заявок на вступление в компанию нет
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => (
              <div
                key={req.id}
                className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-sm)',
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
                    <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                      {req.username}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      хочет вступить{req.event_title ? ` · ${req.event_title}` : ''}
                    </p>
                    {req.created_at && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                        {new Date(req.created_at).toLocaleDateString('ru-RU', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
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
