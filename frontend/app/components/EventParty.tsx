'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import PartyChat from './PartyChat';

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
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id ?? payload.user_id ?? null;
  } catch {
    return null;
  }
}

function getMyUsername(): string | null {
  try {
    const token = getToken();
    if (!token) return null;
    return JSON.parse(atob(token.split('.')[1])).username ?? null;
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

  const statusLabel = {
    pending: '⏳ Ожидает',
    accepted: '✅ Принят',
    rejected: '❌ Отклонён',
  }[member.status];

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border ${
        isMe ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-100 bg-white'
      }`}
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
        {member.username.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {member.username}
          {isMe && <span className="ml-1 text-xs text-indigo-400">(вы)</span>}
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

// ─── Edit Modal ─────────────────────────────────────────────────────────────────────────────

interface EditModalProps {
  party: Party;
  onClose: () => void;
  onSaved: () => void;
}

function EditPartyModal({ party, onClose, onSaved }: EditModalProps) {
  const [form, setForm] = useState({
    title: party.title,
    description: party.description ?? '',
    max_members: party.max_members,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = getToken();

  const acceptedCount = party.members.filter(m => m.status === 'accepted').length;

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Название обязательно'); return; }
    if (form.max_members < 2 || form.max_members > 20) { setError('Участников: от 2 до 20'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/parties/${party.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          max_members: form.max_members,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.detail ?? 'Ошибка сохранения');
      } else {
        onSaved(); onClose();
      }
    } catch { setError('Ошибка сети'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!window.confirm('Удалить компанию? Это действие нельзя отменить.')) return;
    setDeleting(true);
    try {
      await fetch(`${API_BASE}/parties/${party.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      onSaved(); onClose();
    } catch { setError('Ошибка удаления'); }
    setDeleting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center justify-between">
          <h3 className="text-white font-black text-base">✏️ Редактировать компанию</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white transition text-xl leading-none">✕</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">{error}</div>}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Название *</label>
            <input
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
              placeholder="Название компании"
              value={form.title} maxLength={60}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Описание</label>
            <textarea
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition resize-none"
              placeholder="Кого ищешь, планы, пожелания..."
              rows={3} maxLength={300}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Макс. участников</label>
            <div className="flex items-center gap-3">
              <input
                type="number" min={Math.max(2, acceptedCount)} max={20}
                className="w-24 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                value={form.max_members}
                onChange={e => setForm(f => ({ ...f, max_members: Math.min(20, Math.max(2, Number(e.target.value))) }))}
              />
              <span className="text-xs text-gray-400">Сейчас принято: {acceptedCount}</span>
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={handleSave} disabled={saving || deleting}
            className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-sm text-white font-bold hover:opacity-90 transition disabled:opacity-50">
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button onClick={onClose} disabled={saving || deleting}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">
            Отмена
          </button>
          <button onClick={handleDelete} disabled={saving || deleting} title="Удалить компанию"
            className="rounded-xl border border-red-200 px-3 py-2.5 text-red-500 hover:bg-red-50 transition disabled:opacity-50 text-sm">
            {deleting ? '...' : '🗑️'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PartyCard ──────────────────────────────────────────────────────────────────────────────

function PartyCard({
  party,
  myId,
  myUsername,
  onUpdate,
}: {
  party: Party;
  myId: number | null;
  myUsername: string | null;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const token = getToken();

  const isCreator = myId !== null && party.creator_id === myId;
  // Создатель всегда является принятым участником
  const myMembership = party.members.find(m => m.user_id === myId);
  const isAcceptedMember = isCreator || myMembership?.status === 'accepted';

  const acceptedCount = party.members.filter(m => m.status === 'accepted').length;
  const pendingCount  = party.members.filter(m => m.status === 'pending').length;
  const isFull = acceptedCount >= party.max_members;

  // Показываем кнопку вступить только если:
  // не создатель + нет членства + группа открыта + не заполнена
  const canJoin = !isCreator && !myMembership && party.is_open && !isFull;

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
    <>
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden hover:shadow-md transition">
        {/* Card header */}
        <div className="px-5 py-4 flex items-start gap-3 cursor-pointer" onClick={() => setExpanded(v => !v)}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-lg shrink-0">
            🎉
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-gray-900 text-sm">{party.title}</h3>
              {isCreator && (
                <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-semibold">
                  👑 Вы создатель
                </span>
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
          <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            {isCreator && (
              <button onClick={() => setShowEdit(true)} title="Редактировать"
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition text-sm">
                ✏️
              </button>
            )}
            <span className="text-gray-300 text-sm ml-1">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {expanded && (
          <div className="px-5 pb-5 border-t border-gray-50">
            {/* Members list */}
            <div className="mt-4 space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Участники</p>
              {/* Создатель отображается отдельно вверху списка */}
              <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                isCreator ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-100 bg-white'
              }`}>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {party.creator_username.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {party.creator_username}
                    {isCreator && <span className="ml-1 text-xs text-indigo-400">(вы)</span>}
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full border text-indigo-600 bg-indigo-50 border-indigo-200">
                  👑 Создатель
                </span>
              </div>
              {party.members.map(m => (
                <MemberRow
                  key={m.user_id}
                  member={m}
                  isCreator={isCreator}
                  myId={myId}
                  partyId={party.id}
                  onUpdate={onUpdate}
                />
              ))}
              {party.members.length === 0 && (
                <p className="text-xs text-gray-400 pl-1">Партиципантов пока нет</p>
              )}
            </div>

            {/* Action buttons */}
            <div className="mt-4 flex gap-2 flex-wrap">
              {canJoin && (
                <button onClick={handleJoinRequest} disabled={loading}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold py-2 rounded-xl hover:opacity-90 transition disabled:opacity-60">
                  {loading ? 'Отправка...' : '🙋 Подать заявку'}
                </button>
              )}
              {myMembership && !isCreator && (
                <button onClick={handleLeave} disabled={loading}
                  className="text-sm px-4 py-2 text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition disabled:opacity-60">
                  {loading ? '...' : 'Покинуть'}
                </button>
              )}
              {isCreator && party.is_open && (
                <button onClick={handleClose} disabled={loading}
                  className="text-sm px-4 py-2 text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition disabled:opacity-60">
                  🔒 Закрыть набор
                </button>
              )}
              {!isCreator && !myMembership && !party.is_open && (
                <p className="text-xs text-gray-400 py-2">Набор в эту компанию закрыт</p>
              )}
              {!isCreator && !myMembership && isFull && party.is_open && (
                <p className="text-xs text-orange-400 py-2">Компания уже заполнена</p>
              )}
              {myMembership?.status === 'pending' && (
                <p className="text-xs text-amber-500 py-2">⏳ Ваша заявка рассматривается</p>
              )}
            </div>

            {/* Чат — только для принятых участников */}
            {isAcceptedMember && (
              <>
                <button
                  onClick={() => setChatOpen(v => !v)}
                  className={`mt-3 w-full rounded-xl border py-2 text-sm font-semibold transition ${
                    chatOpen
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 text-gray-500 hover:border-indigo-200 hover:text-indigo-600 hover:bg-indigo-50/50'
                  }`}
                >
                  {chatOpen ? '▲ Скрыть чат' : '💬 Открыть чат компании'}
                </button>
                {chatOpen && (
                  <PartyChat
                    partyId={party.id}
                    currentUserId={myId}
                    currentUsername={myUsername}
                    isAcceptedMember={true}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>

      {showEdit && (
        <EditPartyModal party={party} onClose={() => setShowEdit(false)} onSaved={onUpdate} />
      )}
    </>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────────────────────

export default function EventParty({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<number | null>(null);
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = localStorage.getItem('token');
    setToken(t);
    if (t) {
      try {
        const payload = JSON.parse(atob(t.split('.')[1]));
        setMyId(payload.id ?? payload.user_id ?? null);
        setMyUsername(payload.username ?? null);
      } catch {}
    }
  }, []);

  const fetchParties = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/parties/${eventId}`);
      if (res.ok) setParties(await res.json());
    } catch {}
  }, [eventId]);

  useEffect(() => {
    fetchParties().finally(() => setLoading(false));
  }, [fetchParties]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
              <PartyCard key={p.id} party={p} myId={myId} myUsername={myUsername} onUpdate={fetchParties} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
