'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/apiFetch';
import { toast } from '../../components/Toast';

interface InvitePreview {
  id: number;
  title: string;
  description: string | null;
  max_members: number;
  member_count: number;
  creator_username: string;
  event_title: string | null;
  event_date_ts: number | null;
  event_image_url: string | null;
  is_open: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function formatDate(ts: number | null): string | null {
  if (!ts) return null;
  try {
    return new Date(ts * 1000).toLocaleString('ru-RU', {
      day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return null;
  }
}

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const token = params?.token;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        // Public preview — no auth header needed
        const res = await fetch(`${API_BASE}/parties/by-token/${token}`);
        if (!res.ok) {
          if (!cancelled) setError(res.status === 404 ? 'Приглашение не найдено или устарело' : 'Не удалось загрузить приглашение');
          return;
        }
        const data: InvitePreview = await res.json();
        if (!cancelled) setPreview(data);
      } catch {
        if (!cancelled) setError('Не удалось загрузить приглашение');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  async function handleJoin() {
    if (!token || joining) return;
    if (!user) {
      // Save intent and route to login
      try { sessionStorage.setItem('pendingInviteToken', token); } catch { /* ignore */ }
      router.push(`/login?next=/invite/${encodeURIComponent(token)}`);
      return;
    }
    setJoining(true);
    try {
      const res = await apiFetch(`/parties/by-token/${token}/join`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast(body.detail || 'Не удалось присоединиться', 'error');
        setJoining(false);
        return;
      }
      const party = await res.json();
      toast('Вы в компании!', 'success');
      router.push(`/parties/${party.id}`);
    } catch {
      toast('Сеть недоступна', 'error');
      setJoining(false);
    }
  }

  // Auto-join after login if user just signed in with a pending invite
  useEffect(() => {
    if (authLoading || !user || !token || !preview) return;
    let pending: string | null = null;
    try { pending = sessionStorage.getItem('pendingInviteToken'); } catch { /* ignore */ }
    if (pending === token) {
      try { sessionStorage.removeItem('pendingInviteToken'); } catch { /* ignore */ }
      handleJoin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, token, preview]);

  if (loading || authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: 'var(--background)' }}>
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Загрузка...</div>
      </main>
    );
  }

  if (error || !preview) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--background)' }}>
        <div className="max-w-md w-full text-center p-8 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-4xl mb-3">😕</div>
          <h1 className="text-xl font-semibold mb-2">{error || 'Приглашение не найдено'}</h1>
          <Link href="/" className="inline-block mt-4 px-4 py-2 rounded-lg text-white" style={{ background: 'var(--primary)' }}>
            На главную
          </Link>
        </div>
      </main>
    );
  }

  const dateLabel = formatDate(preview.event_date_ts);
  const isFull = preview.member_count >= preview.max_members;
  const canJoin = preview.is_open && !isFull;

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: 'var(--background)' }}>
      <div
        className="max-w-md w-full rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }}
      >
        {preview.event_image_url && (
          <img
            src={preview.event_image_url}
            alt={preview.event_title || preview.title}
            className="w-full h-48 object-cover"
          />
        )}
        <div className="p-6">
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary)' }}>
            Приглашение в компанию
          </div>
          <h1 className="text-2xl font-bold mb-1">{preview.title}</h1>
          {preview.event_title && (
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              на «{preview.event_title}»
            </p>
          )}
          {preview.description && (
            <p className="text-sm mb-4 leading-relaxed">{preview.description}</p>
          )}
          <div className="flex flex-wrap gap-3 text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
            <span>👤 от {preview.creator_username}</span>
            <span>🧑‍🤝‍🧑 {preview.member_count}/{preview.max_members}</span>
            {dateLabel && <span>📅 {dateLabel}</span>}
          </div>

          {!canJoin && (
            <div className="text-sm mb-3 p-3 rounded-lg" style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626' }}>
              {isFull ? 'Все слоты заняты' : 'Набор закрыт'}
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={!canJoin || joining}
            className="w-full py-3 rounded-xl font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--primary)' }}
          >
            {joining ? 'Присоединяемся...' : user ? 'Присоединиться' : 'Войти и присоединиться'}
          </button>

          {!user && (
            <p className="text-xs text-center mt-3" style={{ color: 'var(--text-secondary)' }}>
              Нет аккаунта?{' '}
              <Link
                href={`/register?next=/invite/${encodeURIComponent(token!)}`}
                className="underline"
                style={{ color: 'var(--primary)' }}
              >
                Зарегистрироваться
              </Link>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
