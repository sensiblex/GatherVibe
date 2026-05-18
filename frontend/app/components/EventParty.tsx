'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/apiFetch';
import { toast } from './Toast';
import { capitalizeFirstDisplayChar } from '../lib/text';
import { extractApiErrorMessage } from '../lib/apiErrors';
import { resolveApiBase } from '../lib/apiBase';

const API_BASE = resolveApiBase();
const POLL_INTERVAL = 5000;

export interface PartyMember {
  user_id: number;
  username: string;
  city: string | null;
  interests: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'invited' | 'declined' | 'left';
  joined_at: string;
  message?: string | null;
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

export interface CreatorPartyContext {
  partyId: number;
  creatorId: number;
  members: Array<{ user_id: number; status: PartyMember['status'] }>;
}

const cardStyle = {
  background: 'var(--card-bg, var(--surface))',
  border: '1px solid var(--border)',
};

function JoinModal({
  party,
  token,
  onClose,
  onJoined,
}: {
  party: Party;
  token: string;
  onClose: () => void;
  onJoined: () => void;
}) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const MAX = 100;
  const displayTitle = capitalizeFirstDisplayChar(party.title);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/parties/${party.id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() || null }),
      });
      if (res.ok) {
        toast('Заявка отправлена! Ожидайте подтверждения от создателя', 'info');
        onJoined();
        onClose();
      } else {
        const d = await res.json();
        toast(extractApiErrorMessage(d.detail), 'error');
      }
    } catch {}
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
      >
        <div className="px-6 py-4 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg,#9333ea,#ec4899)' }}>
          <h3 className="text-white font-black text-base">Подать заявку</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white transition text-xl">✕</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            Вы хотите вступить в компанию{' '}
            <span className="font-bold">{displayTitle}</span>.
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Короткое сообщение (необязательно, макс. {MAX} симв.)
            </label>
            <textarea
              className="gv-input resize-none"
              rows={3}
              maxLength={MAX}
              placeholder="Например: Люблю рок, хочу пойти!"
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
            <p className="text-xs text-right" style={{ color: message.length >= MAX ? 'var(--error)' : 'var(--text-faint)' }}>
              {message.length}/{MAX}
            </p>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 py-2.5 text-sm text-white font-bold rounded-xl hover:opacity-90 transition disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#9333ea,#ec4899)' }}
          >
            {loading ? 'Отправка...' : 'Отправить заявку'}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 hover:opacity-80"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function PartyCard({ party, onUpdate }: { party: Party; onUpdate: () => void }) {
  const { user, token } = useAuth();
  const myId = user?.id ?? null;
  const [loading, setLoading] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const displayTitle = capitalizeFirstDisplayChar(party.title);

  const isCreator = myId !== null && party.creator_id === myId;
  const myMembership = party.members.find(m => m.user_id === myId);
  const acceptedCount = party.members.filter(m => m.status === 'accepted').length;
  const isFull = acceptedCount + 1 >= party.max_members;
  const canJoin = !!token && !isCreator && !myMembership && party.is_open && !isFull;
  const canLeave = !!token && !isCreator && myMembership?.status === 'accepted';

  const handleLeave = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/parties/${party.id}/leave`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast('Вы покинули компанию', 'info');
        onUpdate();
      } else {
        const d = await res.json();
        toast(extractApiErrorMessage(d.detail), 'error');
      }
    } catch {}
    setLoading(false);
  };

  const pendingCount = party.members.filter(m => m.status === 'pending').length;

  return (
    <>
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
              <h3 className="font-bold text-sm" style={{ color: 'var(--text)' }}>{displayTitle}</h3>
              {isCreator && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: 'var(--badge-bg, #eef2ff)', color: 'var(--accent, #4f46e5)' }}
                >
                  Вы создатель
                </span>
              )}
              {myMembership?.status === 'accepted' && !isCreator && (
                <span className="text-xs bg-emerald-500/20 text-emerald-500 px-2 py-0.5 rounded-full font-semibold">Участник</span>
              )}
              {myMembership?.status === 'pending' && (
                <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full font-semibold">Ожидает</span>
              )}
              {!party.is_open && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                >
                  Закрыта
                </span>
              )}
              {isFull && party.is_open && (
                <span className="text-xs bg-orange-500/15 text-orange-500 px-2 py-0.5 rounded-full">Заполнена</span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {party.creator_username} · {acceptedCount + 1}/{party.max_members} участников
              {pendingCount > 0 && isCreator && (
                <span className="ml-2 text-amber-500 font-semibold">{pendingCount} ожидают</span>
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
              onClick={() => setShowJoinModal(true)}
              disabled={loading}
              className="flex-1 text-white text-sm font-bold py-2 rounded-xl hover:opacity-90 transition disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#9333ea,#ec4899)' }}
            >
              {loading ? 'Отправка...' : 'Подать заявку'}
            </button>
          )}
          {canLeave && (
            <button
              onClick={handleLeave}
              disabled={loading}
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
            <p className="text-xs py-2 text-amber-500">Ваша заявка рассматривается</p>
          )}
        </div>
      </div>

      {showJoinModal && token && (
        <JoinModal
          party={party}
          token={token}
          onClose={() => setShowJoinModal(false)}
          onJoined={onUpdate}
        />
      )}
    </>
  );
}

export default function EventParty({
  eventId,
  onCreatorPartyChange,
}: {
  eventId: string;
  onCreatorPartyChange?: (context: CreatorPartyContext | null) => void;
}) {
  const router = useRouter();
  const params = useParams();
  const urlEventId = (params?.id as string) ?? eventId;

  const { token, user } = useAuth();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchParties = useCallback(async () => {
    try {
      const res = await apiFetch(`/parties/${eventId}`);
      if (!res.ok) {
        onCreatorPartyChange?.(null);
        return;
      }
      const data: Party[] = await res.json();
      setParties(data);
      if (onCreatorPartyChange) {
        const myParty = user
          ? data.find((party) => party.creator_id === user.id) ?? null
          : null;
        onCreatorPartyChange(
          myParty
            ? {
                partyId: myParty.id,
                creatorId: myParty.creator_id,
                members: myParty.members.map((member) => ({
                  user_id: member.user_id,
                  status: member.status,
                })),
              }
            : null
        );
      }
    } catch {
      onCreatorPartyChange?.(null);
    }
  }, [eventId, token, onCreatorPartyChange, user]);

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
            Компании на событие
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
          onClick={() => {
            if (token) {
              window.location.href = `/events/${eventId}/create-party`;
            } else {
              window.location.href = '/login';
            }
          }}
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

