'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
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

function PartyCard({ party, onUpdate }: { party: Party; onUpdate: () => void }) {
  const router = useRouter();
  const { user, token } = useAuth();
  const myId = user?.id ?? null;

  const [loading, setLoading] = useState(false);

  const isCreator = myId !== null && party.creator_id === myId;
  const myMembership = party.members.find(m => m.user_id === myId);
  const acceptedCount = party.members.filter(m => m.status === 'accepted').length;
  const isFull = acceptedCount + 1 >= party.max_members; // +1 for creator
  // Only show join if: logged in, not creator, no membership (or was rejected), open, not full
  const canJoin = !!token && !isCreator && (!myMembership || myMembership.status === 'rejected') && party.is_open && !isFull;
  // Can leave only if accepted member (not creator, not rejected)
  const canLeave = !!token && !isCreator && myMembership && myMembership.status !== 'rejected';

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
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden hover:shadow-md transition">
      <div className="px-5 py-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-lg shrink-0">🎉</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900 text-sm">{party.title}</h3>
            {isCreator && <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-semibold">👑 Вы создатель</span>}
            {myMembership?.status === 'accepted' && !isCreator && <span className="text-xs bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-semibold">✅ Участник</span>}
            {myMembership?.status === 'rejected' && <span className="text-xs bg-red-100 text-red-500 px-2 py-0.5 rounded-full font-semibold">❌ Отклонён</span>}
            {myMembership?.status === 'pending' && <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-semibold">⏳ Ожидает</span>}
            {!party.is_open && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">🔒 Закрыта</span>}
            {isFull && party.is_open && <span className="text-xs bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full">👥 Заполнена</span>}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {party.creator_username} · {acceptedCount + 1}/{party.max_members} участников
            {pendingCount > 0 && isCreator && <span className="ml-2 text-amber-500 font-semibold">⏳ {pendingCount} ожидают</span>}
          </p>
          {party.description && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{party.description}</p>}
        </div>
        <Link
          href={`/parties/${party.id}`}
          className="shrink-0 text-xs px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition font-semibold"
        >
          Подробнее →
        </Link>
      </div>
      <div className="px-5 pb-4 flex gap-2 flex-wrap">
        {canJoin && (
          <button onClick={handleJoinRequest} disabled={loading}
            className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold py-2 rounded-xl hover:opacity-90 transition disabled:opacity-60">
            {loading ? 'Отправка...' : '🙋 Подать заявку'}
          </button>
        )}
        {canLeave && (
          <button onClick={handleLeave} disabled={loading}
            className="text-sm px-4 py-2 text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition disabled:opacity-60">
            {loading ? '...' : 'Покинуть'}
          </button>
        )}
        {!isCreator && !canJoin && !canLeave && !myMembership?.status && !party.is_open && (
          <p className="text-xs text-gray-400 py-2">Набор в эту компанию закрыт</p>
        )}
        {!isCreator && isFull && party.is_open && !myMembership && (
          <p className="text-xs text-orange-400 py-2">Компания уже заполнена</p>
        )}
        {myMembership?.status === 'pending' && (
          <p className="text-xs text-amber-500 py-2">⏳ Ваша заявка рассматривается</p>
        )}
        {myMembership?.status === 'rejected' && canJoin && (
          <p className="text-xs text-red-400 py-1">Ваша заявка была отклонена. Можете подать снова.</p>
        )}
      </div>
    </div>
  );
}

export default function EventParty({ eventId }: { eventId: string }) {
  const router = useRouter();
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
            if (!oldMe || !newMe) return;
            if (oldMe.status === 'pending' && newMe.status === 'accepted') {
              toast(`🎉 Вас приняли в компанию «${newParty.title}»!`, 'success');
            }
            if (oldMe.status === 'pending' && newMe.status === 'rejected') {
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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900 text-base">
            🎉 Компании на событие
            {parties.length > 0 && <span className="ml-2 text-sm font-normal text-gray-400">{parties.length} шт.</span>}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Создай компанию или вступи в готовую</p>
        </div>
        <button
          onClick={() => token
            ? router.push(`/events/${eventId}/create-party`)
            : (window.location.href = '/login')
          }
          className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold px-4 py-1.5 rounded-full hover:opacity-90 shadow-sm transition">
          + Создать
        </button>
      </div>
      <div className="p-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : parties.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-4xl mb-3">🎊</p>
            <p className="text-gray-500 font-medium">Компаний пока нет</p>
            <p className="text-sm text-gray-400 mt-1">Создай первую — нажми «+ Создать»</p>
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
