'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import PartyChat from '../../components/PartyChat';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../components/Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const POLL_INTERVAL = 5000;

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

function KickModal({
  member,
  partyId,
  token,
  onClose,
  onKicked,
}: {
  member: PartyMember;
  partyId: number;
  token: string;
  onClose: () => void;
  onKicked: () => void;
}) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleKick = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/parties/${partyId}/members/${member.user_id}/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      if (res.ok) {
        toast(`🚫 ${member.username} исключён из компании`, 'info');
        onKicked();
        onClose();
      } else {
        const d = await res.json();
        toast(d.detail || 'Ошибка', 'error');
      }
    } catch {}
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-red-500 to-pink-600 flex items-center justify-between">
          <h3 className="text-white font-black text-base">🚫 Исключить участника</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white transition text-xl">✕</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <p className="text-sm text-gray-700">
            Вы собираетесь исключить <span className="font-bold">{member.username}</span> из компании.
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Причина (необязательно)</label>
            <textarea
              className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition resize-none"
              rows={3}
              maxLength={200}
              placeholder="Укажите причину исключения..."
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={handleKick}
            disabled={loading}
            className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-pink-600 py-2.5 text-sm text-white font-bold hover:opacity-90 transition disabled:opacity-50">
            {loading ? 'Исключение...' : '🚫 Исключить'}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function EditPartyModal({ party, onClose, onSaved }: { party: Party; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [form, setForm] = useState({ title: party.title, description: party.description ?? '', max_members: party.max_members });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const acceptedCount = party.members.filter(m => m.status === 'accepted').length + 1;

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Название обязательно'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/parties/${party.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: form.title.trim(), description: form.description.trim() || null, max_members: form.max_members }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.detail ?? 'Ошибка'); }
      else { toast('Изменения сохранены', 'success'); onSaved(); onClose(); }
    } catch { setError('Ошибка сети'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!window.confirm('Удалить компанию?')) return;
    setDeleting(true);
    try {
      await fetch(`${API_BASE}/parties/${party.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      toast('Компания удалена', 'info');
      onSaved();
      onClose();
      router.push(`/events/${party.event_id}`);
    } catch { setError('Ошибка удаления'); }
    setDeleting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center justify-between">
          <h3 className="text-white font-black text-base">✏️ Редактировать компанию</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white transition text-xl">✕</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">{error}</div>}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Название *</label>
            <input className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
              value={form.title} maxLength={60} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Описание</label>
            <textarea className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition resize-none"
              rows={3} maxLength={300} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Макс. участников</label>
            <div className="flex items-center gap-3">
              <input type="number" min={Math.max(2, acceptedCount)} max={20}
                className="w-24 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                value={form.max_members} onChange={e => setForm(f => ({ ...f, max_members: Math.min(20, Math.max(2, Number(e.target.value))) }))} />
              <span className="text-xs text-gray-400">Принято: {acceptedCount}</span>
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={handleSave} disabled={saving || deleting}
            className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-sm text-white font-bold hover:opacity-90 transition disabled:opacity-50">
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button onClick={onClose} disabled={saving || deleting}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">Отмена</button>
          <button onClick={handleDelete} disabled={saving || deleting}
            className="rounded-xl border border-red-200 px-3 py-2.5 text-red-500 hover:bg-red-50 transition disabled:opacity-50 text-sm">
            {deleting ? '...' : '🗑️'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PartyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const partyId = Number(params?.partyId);
  const { user, token } = useAuth();
  const myId = user?.id ?? null;
  const myUsername = user?.username ?? null;

  const [party, setParty] = useState<Party | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [kickTarget, setKickTarget] = useState<PartyMember | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const prevPartyRef = useRef<Party | null>(null);

  const fetchParty = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/parties/detail/${partyId}`);
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data: Party = await res.json();

      // Detect status changes via polling
      if (token && prevPartyRef.current) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const uid: number = payload.id ?? payload.user_id;
          const oldMe = prevPartyRef.current.members.find(m => m.user_id === uid);
          const newMe = data.members.find(m => m.user_id === uid);
          if (oldMe?.status === 'pending' && newMe?.status === 'accepted') {
            toast('🎉 Вас приняли в компанию!', 'success');
          }
          // Rejected: record deleted, so oldMe exists but newMe is gone
          if (oldMe?.status === 'pending' && !newMe) {
            toast('Ваша заявка отклонена', 'error');
          }
          // Kicked
          if (oldMe?.status === 'accepted' && !newMe) {
            toast('Вы были исключены из компании', 'error');
          }
        } catch {}
      }

      prevPartyRef.current = data;
      setParty(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }, [partyId, token]);

  useEffect(() => { fetchParty(); }, [fetchParty]);

  useEffect(() => {
    const id = setInterval(fetchParty, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchParty]);

  const handleJoin = async () => {
    if (!token) { window.location.href = '/login'; return; }
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/parties/${partyId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { toast('🙋 Заявка отправлена!', 'info'); fetchParty(); }
      else { const d = await res.json(); toast(d.detail || 'Ошибка', 'error'); }
    } catch {}
    setActionLoading(false);
  };

  const handleLeave = async () => {
    if (!token) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/parties/${partyId}/leave`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { toast('Вы покинули компанию', 'info'); setChatOpen(false); fetchParty(); }
    } catch {}
    setActionLoading(false);
  };

  const handleClose = async () => {
    if (!token) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/parties/${partyId}/close`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) { toast('🔒 Набор закрыт', 'info'); fetchParty(); }
    } catch {}
    setActionLoading(false);
  };

  const handleDecision = async (userId: number, action: 'accept' | 'reject') => {
    if (!token) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/parties/${partyId}/members/${userId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast(action === 'accept' ? '✅ Принят' : '❌ Отклонён', action === 'accept' ? 'success' : 'error');
        fetchParty();
      }
    } catch {}
    setActionLoading(false);
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="container mx-auto px-4 py-10 animate-pulse">
        <div className="h-4 w-40 bg-gray-200 rounded mb-8" />
        <div className="h-8 bg-gray-200 rounded w-1/2 mb-4" />
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">{[1,2,3].map(i=><div key={i} className="h-16 bg-gray-200 rounded-2xl"/>)}</div>
          <div className="space-y-3">{[1,2].map(i=><div key={i} className="h-24 bg-gray-200 rounded-2xl"/>)}</div>
        </div>
      </div>
    </div>
  );

  if (error || !party) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <span className="text-5xl">😕</span>
        <p className="text-gray-600">Не удалось загрузить компанию</p>
        <p className="text-red-400 text-sm">{error}</p>
        <button onClick={() => router.back()}
          className="bg-indigo-600 text-white px-6 py-2 rounded-xl hover:bg-indigo-700 transition">Назад</button>
      </div>
    </div>
  );

  const isCreator = myId !== null && party.creator_id === myId;
  const myMembership = party.members.find(m => m.user_id === myId);
  const isAcceptedMember = isCreator || myMembership?.status === 'accepted';
  const acceptedCount = party.members.filter(m => m.status === 'accepted').length;
  const pendingCount = party.members.filter(m => m.status === 'pending').length;
  const isFull = acceptedCount + 1 >= party.max_members;
  // Can join: logged in, not creator, NO membership record at all (rejected users have record deleted), open, not full
  const canJoin = !!token && !isCreator && !myMembership && party.is_open && !isFull;
  // Can leave: logged in, not creator, accepted members ONLY
  const canLeave = !!token && !isCreator && myMembership?.status === 'accepted';

  const statusColor = (status: string) => ({
    pending: 'text-amber-600 bg-amber-50 border-amber-200',
    accepted: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    rejected: 'text-red-400 bg-red-50 border-red-200',
  }[status] ?? '');

  const statusLabel = (status: string) => ({
    pending: '⏳ Ожидает',
    accepted: '✅ Принят',
    rejected: '❌ Отклонён',
  }[status] ?? status);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="container mx-auto px-4 py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-400 mb-8">
          <Link href="/events" className="hover:text-indigo-600 transition">События</Link>
          <span>/</span>
          <Link href={`/events/${party.event_id}`} className="hover:text-indigo-600 transition">Событие</Link>
          <span>/</span>
          <span className="text-gray-700 line-clamp-1 max-w-xs">{party.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT — members */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-3xl shrink-0">🎉</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-black text-gray-900">{party.title}</h1>
                    {!party.is_open && <span className="text-sm bg-gray-100 text-gray-500 px-3 py-1 rounded-full">🔒 Набор закрыт</span>}
                    {isFull && party.is_open && <span className="text-sm bg-orange-50 text-orange-500 px-3 py-1 rounded-full">👥 Заполнена</span>}
                  </div>
                  {party.description && <p className="text-gray-500 mt-2">{party.description}</p>}
                  <p className="text-sm text-gray-400 mt-2">
                    Создатель: <span className="font-semibold text-gray-700">{party.creator_username}</span>
                    {' · '}{acceptedCount + 1}/{party.max_members} участников
                    {' · '}Создана {new Date(party.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                {isCreator && (
                  <button onClick={() => setShowEdit(true)}
                    className="shrink-0 text-sm px-3 py-1.5 border border-gray-200 rounded-xl text-gray-500 hover:bg-gray-50 transition">
                    ✏️ Редактировать
                  </button>
                )}
              </div>
            </div>

            {/* Members list */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-gray-900">Участники</h2>
                {pendingCount > 0 && isCreator && (
                  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full font-semibold">⏳ {pendingCount} ожидают</span>
                )}
              </div>
              <div className="space-y-3">
                {/* Creator row — always shown, never duplicated */}
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                  isCreator ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-100 bg-white'
                }`}>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {party.creator_username.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {party.creator_username}
                      {isCreator && <span className="ml-1 text-xs text-indigo-400">(вы)</span>}
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full border text-indigo-600 bg-indigo-50 border-indigo-200">👑 Создатель</span>
                </div>

                {/* Other members — creator excluded on backend */}
                {party.members.map(member => (
                  <div key={member.user_id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                    member.user_id === myId ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-100 bg-white'
                  }`}>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {member.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {member.username}
                        {member.user_id === myId && <span className="ml-1 text-xs text-indigo-400">(вы)</span>}
                      </p>
                      {member.city && <p className="text-xs text-gray-400">📍 {member.city}</p>}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusColor(member.status)}`}>
                      {statusLabel(member.status)}
                    </span>
                    {/* Creator actions on pending */}
                    {isCreator && member.status === 'pending' && (
                      <div className="flex gap-1 ml-1">
                        <button
                          onClick={() => handleDecision(member.user_id, 'accept')}
                          disabled={actionLoading}
                          className="text-xs px-2 py-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition disabled:opacity-50"
                          title="Принять">✓</button>
                        <button
                          onClick={() => handleDecision(member.user_id, 'reject')}
                          disabled={actionLoading}
                          className="text-xs px-2 py-1 bg-red-400 text-white rounded-lg hover:bg-red-500 transition disabled:opacity-50"
                          title="Отклонить">✗</button>
                      </div>
                    )}
                    {/* Creator kick accepted members */}
                    {isCreator && member.status === 'accepted' && (
                      <button
                        onClick={() => setKickTarget(member)}
                        disabled={actionLoading}
                        className="ml-1 text-xs px-2 py-1 bg-red-50 text-red-500 border border-red-200 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
                        title="Исключить">
                        🚫 Кик
                      </button>
                    )}
                  </div>
                ))}
                {party.members.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">Участников пока нет. Будьте первым!</p>
                )}
              </div>
            </div>

            {/* Chat */}
            {isAcceptedMember && user && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <button
                  onClick={() => setChatOpen(v => !v)}
                  className={`w-full px-6 py-4 flex items-center justify-between font-semibold text-sm transition ${
                    chatOpen ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}>
                  <span>💬 Чат компании</span>
                  <span>{chatOpen ? '▲' : '▼'}</span>
                </button>
                {chatOpen && (
                  <PartyChat partyId={party.id} currentUserId={myId} currentUsername={myUsername} isAcceptedMember={true} />
                )}
              </div>
            )}
          </div>

          {/* RIGHT — info & actions */}
          <div className="space-y-5">
            {/* Actions */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Действия</h3>

              {canJoin && (
                <button onClick={handleJoin} disabled={actionLoading}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-bold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-60">
                  {actionLoading ? 'Отправка...' : '🙋 Подать заявку'}
                </button>
              )}
              {canLeave && (
                <button onClick={handleLeave} disabled={actionLoading}
                  className="w-full text-sm py-2.5 text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition disabled:opacity-60">
                  {actionLoading ? '...' : '🚪 Покинуть компанию'}
                </button>
              )}
              {isCreator && party.is_open && (
                <button onClick={handleClose} disabled={actionLoading}
                  className="w-full text-sm py-2.5 text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition disabled:opacity-60">
                  🔒 Закрыть набор
                </button>
              )}
              {myMembership?.status === 'pending' && (
                <p className="text-xs text-center text-amber-500">⏳ Ваша заявка рассматривается</p>
              )}
              {!token && (
                <Link href="/login"
                  className="block w-full text-center text-sm py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition font-semibold">
                  Войти чтобы вступить
                </Link>
              )}
            </div>

            {/* Info */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Информация</h3>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Статус набора</span>
                <span className={`font-semibold ${party.is_open ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {party.is_open ? '🟢 Открыт' : '🔒 Закрыт'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Участников</span>
                <span className="font-semibold text-gray-800">{acceptedCount + 1} / {party.max_members}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Заявок</span>
                <span className="font-semibold text-amber-600">{pendingCount}</span>
              </div>
            </div>

            {/* Back to event */}
            <Link
              href={`/events/${party.event_id}`}
              className="block w-full text-center text-sm py-2.5 border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 transition">
              ← Вернуться к событию
            </Link>
          </div>
        </div>
      </main>

      {showEdit && party && (
        <EditPartyModal party={party} onClose={() => setShowEdit(false)} onSaved={fetchParty} />
      )}
      {kickTarget && token && (
        <KickModal
          member={kickTarget}
          partyId={partyId}
          token={token}
          onClose={() => setKickTarget(null)}
          onKicked={fetchParty}
        />
      )}
    </div>
  );
}
