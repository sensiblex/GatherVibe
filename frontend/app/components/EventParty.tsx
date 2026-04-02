'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { toast } from './Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const POLL_INTERVAL = 5000;

export interface PartyMember {
  user_id: number;
  username: string;
  city: string | null;
  interests: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  joined_at: string;
}

export interface Party {
  id: number;
  event_id: string;
  title: string;
  description: string | null;
  max_members: number;
  creator_id: number;
  creator_username: string;
  is_open: boolean;
  members: PartyMember[];
  created_at: string;
}

const cardStyle = {
  background: 'var(--card-bg, var(--surface))',
  border: '1px solid var(--border)',
};

function PartyCard({ party, onUpdate }: { party: Party; onUpdate: () => void }) {
  const { user, token } = useAuth();
  const myId = user?.id ?? null;
  const [loading, setLoading] = useState(false);

  const isCreator = myId !== null && party.creator_id === myId;
  const myMembership = party.members.find(m => m.user_id === myId);
  const acceptedCount = party.members.filter(m => m.status === 'accepted').length;
  const isFull = acceptedCount + 1 >= party.max_members;
  const canJoin = !!token && !isCreator && !myMembership && party.is_open && !isFull;
  const canLeave = !!token && !isCreator && myMembership?.status === 'accepted';

  const handleJoinRequest = async () => {
    if (!token) { window.location.href = '/login'; return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/parties/${party.id}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast('🙋 Заявка отправлена! Ожидайте подтверждения от создателя', 'info');
        onUpdate();
      } else {
        const d = await res.json();
        toast(d.detail || 'Не удалось отправить заявку', 'error');
      }
    } catch {}
    setLoading(false);
  };

  const handleLeave = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/parties/${party.id}/leave`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast('Вы покинули компанию', 'info');
        onUpdate();
      }
    } catch {}
    setLoading(false);
  };

  const pendingCount = party.members.filter(m => m.status === 'pending').length;

  return (
    <div
      className="rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition"
      style={cardStyle}
    >
      <div className="px-5 py-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-lg shrink-0">
          🎉
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-sm" style={{ color: 'var(--text)' }}>{party.title}</h3>
            {isCreator && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: 'var(--badge-bg, #eef2ff)', color: 'var(--accent, #4f46e5)' }}
              >
                👑 Вы создатель
              </span>
            )}
            {myMembership?.status === 'accepted' && !isCreator && (
              <span className="text-xs bg-emerald-500/20 text-emerald-500 px-2 py-0.5 rounded-full font-semibold">✅ Участник</span>
            )}
            {myMembership?.status === 'pending' && (
              <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full font-semibold">⏳ Ожидает</span>
            )}
            {!party.is_open && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
              >
                🔒 Закрыта
              </span>
            )}
            {isFull && party.is_open && (
              <span className="text-xs bg-orange-500/15 text-orange-500 px-2 py-0.5 rounded-full">👥 Заполнена</span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {party.creator_username} · {acceptedCount + 1}/{party.max_members} участников
            {pendingCount > 0 && isCreator && (
              <span className="ml-2 text-amber-500 font-semibold">⏳ {pendingCount} ожидают</span>
            )}
          </p>
          {party.description && (
            <p className="text-xs mt-1 line-clamp-1" style={{ color: 'var(--text-muted)' }}>
              {party.description}
            </p>
          )}
        </div>
        <Link
          href={`/parties/${party.id}`}
          className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-semibold transition hover:opacity-80"
          style={{ background: 'var(--badge-bg, #eef2ff)', color: 'var(--accent, #4f46e5)' }}
        >
          Подробнее →
        </Link>
      </div>

      <div className="px-5 pb-4 flex gap-2 flex-wrap">
        {canJoin && (
          <button
            onClick={handleJoinRequest} disabled={loading}
            className="flex-1 text-white text-sm font-bold py-2 rounded-xl hover:opacity-90 transition disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#9333ea,#ec4899)' }}
          >
            {loading ? 'Отправка...' : '🙋 Подать заявку'}
          </button>
        )}
        {canLeave && (
          <button
            onClick={handleLeave} disabled={loading}
            className="text-sm px-4 py-2 rounded-xl transition disabled:opacity-60"
            style={{
              color: '#ef4444',
              border: '1px solid color-mix(in oklch, #ef4444 40%, transparent)',
            }}
          >
            {loading ? '...' : 'Покинуть'}
          </button>
        )}
        {!isCreator && !canJoin && !canLeave && !party.is_open && (
          <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>
            Набор в эту компанию закрыт
          </p>
        )}
        {!isCreator && isFull && party.is_open && !myMembership && (
          <p className="text-xs py-2 text-orange-400">Компания уже заполнена</p>
        )}
        {myMembership?.status === 'pending' && (
          <p className="text-xs py-2 text-amber-500">⏳ Ваша заявка рассматривается</p>
        )}
      </div>
    </div>
  );
}

export default function EventParty({ eventId }: { eventId: string }) {
  const router = useRouter();
  const params = useParams();
  // Always use the raw URL segment for navigation so that KudaGo events
  // (where eventId prop = kudago_id) don't produce a wrong route like
  // /events/244451/create-party when the user is actually on /events/3.
  const urlEventId = (params?.id as string) ?? eventId;

  const { token } = useAuth();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const prevPartiesRef = useRef<Party[]>([]);

  const fetchParties = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/parties/${eventId}`);
      if (!res.ok) return;
      const data: Party[] = await res.json();

      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const myId: number = payload.id ?? payload.user_id;
          data.forEach(newParty => {
            const oldParty = prevPartiesRef.current.find(p => p.id === newParty.id);
            if (!oldParty) return;
            const oldMe = oldParty.members.find(m => m.user_id === myId);
            const newMe = newParty.members.find(m => m.user_id === myId);
            if (oldMe?.status === 'pending' && newMe?.status === 'accepted') {
              toast(`🎉 Вас приняли в компанию «${newParty.title}»!`, 'success');
            }
            if (oldMe?.status === 'pending' && !newMe) {
              toast(`Заявка в «${newParty.title}» отклонена`, 'error');
            }
          });
        } catch {}
      }

      prevPartiesRef.current = data;
      setParties(data);
    } catch {}
  }, [eventId, token]);

  useEffect(() => {
    fetchParties().finally(() => setLoading(false));
  }, [fetchParties]);

  useEffect(() => {
    const id = setInterval(fetchParties, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchParties]);

  return (
    <div
      className="rounded-2xl shadow-sm overflow-hidden"
      style={cardStyle}
    >
      <div
        className="px-6 py-5 flex items-center justify-between gap-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>
            🎉 Компании на событие
            {parties.length > 0 && (
              <span className="ml-2 text-sm font-normal" style={{ color: 'var(--text-muted)' }}>
                {parties.length} шт.
              </span>
            )}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Создай компанию или вступи в готовую
          </p>
        </div>
        <button
          onClick={() => token
            ? router.push(`/events/${urlEventId}/create-party`)
            : (window.location.href = '/login')
          }
          className="text-white text-sm font-bold px-4 py-1.5 rounded-full hover:opacity-90 shadow-sm transition"
          style={{ background: 'linear-gradient(135deg,#9333ea,#ec4899)' }}
        >
          + Создать
        </button>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div
                key={i}
                className="h-20 rounded-2xl animate-pulse"
                style={{ background: 'var(--surface-2)' }}
              />
            ))}
          </div>
        ) : parties.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-4xl mb-3">🎊</p>
            <p className="font-medium" style={{ color: 'var(--text-muted)' }}>Компаний пока нет</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Создай первую — нажми «+ Создать»</p>
          </div>
        ) : (
          <div className="space-y-3">
            {parties.map(p => (
              <PartyCard key={p.id} party={p} onUpdate={fetchParties} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
