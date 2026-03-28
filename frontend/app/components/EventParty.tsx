'use client';

import { useState, useEffect, useCallback } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface PartyMember {
  user_id: number;
  username: string;
  city: string | null;
  interests: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  joined_at: string;
}

interface Party {
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

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

function getMyUserId(): number | null {
  try {
    const token = getToken();
    if (!token) return null;
    return JSON.parse(atob(token.split('.')[1])).user_id;
  } catch {
    return null;
  }
}

function MemberRow({
  member,
  isCreator,
  myId,
  partyId,
  onUpdate,
}: {
  member: PartyMember;
  isCreator: boolean;
  myId: number | null;
  partyId: number;
  onUpdate: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const token = getToken();
  const isMe = member.user_id === myId;

  const handleDecision = async (action: 'accept' | 'reject') => {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/parties/${partyId}/members/${member.user_id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      onUpdate();
    } catch {}
    setLoading(false);
  };

  const statusColor = {
    pending: 'text-amber-600 bg-amber-50 border-amber-200',
    accepted: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    rejected: 'text-red-400 bg-red-50 border-red-200',
  }[member.status];

  const statusLabel = { pending: '⏳ Ожидает', accepted: '✅ Принят', rejected: '❌ Отклонён' }[
    member.status
  ];

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${
      isMe ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-100 bg-white'
    }`}>
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
        {member.username.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {member.username}{isMe && <span className="ml-1 text-xs text-indigo-400">(вы)</span>}
        </p>
        {member.city && <p className="text-xs text-gray-400">📍 {member.city}</p>}
      </div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusColor}`}>
        {statusLabel}
      </span>
      {isCreator && !isMe && member.status === 'pending' && (
        <div className="flex gap-1">
          <button
            onClick={() => handleDecision('accept')}
            disabled={loading}
            className="text-xs px-2 py-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition disabled:opacity-50"
          >
            ✓
          </button>
          <button
            onClick={() => handleDecision('reject')}
            disabled={loading}
            className="text-xs px-2 py-1 bg-red-400 text-white rounded-lg hover:bg-red-500 transition disabled:opacity-50"
          >
            ✗
          </button>
        </div>
      )}
    </div>
  );
}

function PartyCard({
  party,
  myId,
  onUpdate,
}: {
  party: Party;
  myId: number | null;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const token = getToken();
  const isCreator = party.creator_id === myId;
  const myMembership = party.members.find((m) => m.user_id === myId);
  const acceptedCount = party.members.filter((m) => m.status === 'accepted').length;
  const pendingCount = party.members.filter((m) => m.status === 'pending').length;
  const isFull = acceptedCount >= party.max_members;

  const handleJoinRequest = async () => {
    if (!token) { window.location.href = '/login'; return; }
    setLoading(true);
    try {
      await fetch(`${API_BASE}/parties/${party.id}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      onUpdate();
    } catch {}
    setLoading(false);
  };

  const handleLeave = async () => {
    if (!token) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE}/parties/${party.id}/leave`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      onUpdate();
    } catch {}
    setLoading(false);
  };

  const handleClose = async () => {
    if (!token) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE}/parties/${party.id}/close`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      onUpdate();
    } catch {}
    setLoading(false);
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden hover:shadow-md transition">
      <div
        className="px-5 py-4 flex items-start gap-3 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-lg shrink-0">
          🎉
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900 text-sm">{party.title}</h3>
            {isCreator && (
              <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-semibold">👑 Вы создатель</span>
            )}
            {!party.is_open && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">🔒 Закрыта</span>
            )}
            {isFull && party.is_open && (
              <span className="text-xs bg-orange-50 text-orange-500 px-2 py-0.5 rounded-full">👥 Заполнена</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {party.creator_username} · {acceptedCount}/{party.max_members} участников
            {pendingCount > 0 && isCreator && (
              <span className="ml-2 text-amber-500 font-semibold">⏳ {pendingCount} ожидают</span>
            )}
          </p>
          {party.description && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-1">{party.description}</p>
          )}
        </div>
        <span className="text-gray-300 text-sm">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-50">
          {/* Members */}
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Участники</p>
            {party.members.length === 0 ? (
              <p className="text-xs text-gray-400">Пока никого нет</p>
            ) : (
              party.members.map((m) => (
                <MemberRow
                  key={m.user_id}
                  member={m}
                  isCreator={isCreator}
                  myId={myId}
                  partyId={party.id}
                  onUpdate={onUpdate}
                />
              ))
            )}
          </div>

          {/* Actions */}
          <div className="mt-4 flex gap-2 flex-wrap">
            {!myMembership && !isCreator && party.is_open && !isFull && (
              <button
                onClick={handleJoinRequest}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold py-2 rounded-xl hover:opacity-90 transition disabled:opacity-60"
              >
                {loading ? 'Отправка...' : '🙋 Подать заявку'}
              </button>
            )}
            {myMembership && !isCreator && (
              <button
                onClick={handleLeave}
                disabled={loading}
                className="text-sm px-4 py-2 text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition disabled:opacity-60"
              >
                {loading ? '...' : 'Покинуть'}
              </button>
            )}
            {isCreator && party.is_open && (
              <button
                onClick={handleClose}
                disabled={loading}
                className="text-sm px-4 py-2 text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition disabled:opacity-60"
              >
                🔒 Закрыть набор
              </button>
            )}
            {!myMembership && !isCreator && !party.is_open && (
              <p className="text-xs text-gray-400 py-2">Набор в эту компанию закрыт</p>
            )}
            {!myMembership && !isCreator && isFull && party.is_open && (
              <p className="text-xs text-orange-400 py-2">Компания уже заполнена</p>
            )}
            {myMembership?.status === 'pending' && (
              <p className="text-xs text-amber-500 py-2">⏳ Ваша заявка рассматривается создателем</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EventParty({ eventId }: { eventId: string }) {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', max_members: 4 });
  const myId = getMyUserId();
  const token = getToken();

  const fetchParties = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/parties/${eventId}`);
      if (res.ok) setParties(await res.json());
    } catch {}
  }, [eventId]);

  useEffect(() => {
    fetchParties().finally(() => setLoading(false));
  }, [fetchParties]);

  const handleCreate = async () => {
    if (!token) { window.location.href = '/login'; return; }
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/parties/${eventId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ title: '', description: '', max_members: 4 });
        setShowCreate(false);
        await fetchParties();
      }
    } catch {}
    setCreating(false);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900 text-base">
            🎉 Компании на событие
            {parties.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">{parties.length} шт.</span>
            )}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Создай компанию или вступи в готовую</p>
        </div>
        <button
          onClick={() => (token ? setShowCreate((v) => !v) : (window.location.href = '/login'))}
          className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold px-4 py-1.5 rounded-full hover:opacity-90 shadow-sm transition"
        >
          + Создать
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="px-6 py-4 bg-purple-50/50 border-b border-purple-100">
          <p className="text-sm font-semibold text-gray-700 mb-3">Новая компания</p>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value.slice(0, 60) }))}
            placeholder="Название компании *"
            className="w-full text-sm border border-purple-200 rounded-xl px-4 py-2.5 mb-2 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value.slice(0, 300) }))}
            placeholder="Описание (необязательно) — кого ищешь, планы и т.д."
            rows={2}
            className="w-full text-sm border border-purple-200 rounded-xl px-4 py-2.5 mb-3 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white resize-none"
          />
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm text-gray-600 shrink-0">Макс. участников:</label>
            <input
              type="number"
              min={2}
              max={20}
              value={form.max_members}
              onChange={(e) => setForm((f) => ({ ...f, max_members: Math.min(20, Math.max(2, +e.target.value)) }))}
              className="w-20 text-sm border border-purple-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300 bg-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating || !form.title.trim()}
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold py-2 rounded-xl hover:opacity-90 transition disabled:opacity-60"
            >
              {creating ? 'Создание...' : 'Создать компанию'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 text-sm text-gray-400 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Parties list */}
      <div className="p-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : parties.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-4xl mb-3">🎊</p>
            <p className="text-gray-500 font-medium">Компаний пока нет</p>
            <p className="text-sm text-gray-400 mt-1">Создай первую — нажми «Создать»</p>
          </div>
        ) : (
          <div className="space-y-3">
            {parties.map((p) => (
              <PartyCard key={p.id} party={p} myId={myId} onUpdate={fetchParties} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
