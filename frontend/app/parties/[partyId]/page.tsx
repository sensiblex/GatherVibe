'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Socket } from 'socket.io-client';
import Navbar from '../../components/Navbar';
import PartyChat from '../../components/PartyChat';
import PinnedBlock from '../../components/PartyCoordination/PinnedBlock';
import AttendanceBar from '../../components/PartyCoordination/AttendanceBar';
import ActivePoll from '../../components/PartyCoordination/ActivePoll';
import PartyMeetingPlan from '../../components/PartyMeetingPlan';
import PartyRecapTab from '../../components/PartyRecapTab';
import PushPermissionPrompt from '../../components/PushPermissionPrompt';
import ReviewModal, { ReviewableUser } from '../../components/ReviewModal';
import { useAuth } from '../../context/AuthContext';
import { toast } from '../../components/Toast';
import { apiFetch } from '../../lib/apiFetch';
import { extractApiErrorMessage } from '../../lib/apiErrors';
import { getSocket } from '../../lib/socket';
import { buildEventIdentityMeta } from '../../lib/event-identity';
import { resolveApiBase } from '../../lib/apiBase';

const API_BASE = resolveApiBase();
const POLL_INTERVAL = 5000;

function toMediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  // For uploads, don't add /api prefix since they're served directly
  if (path.startsWith('/uploads/')) return path;
  return `${API_BASE}${path}`;
}

interface PartyDeletedPayload {
  party_id: number;
  party_title: string;
}

type MemberStatus = 'pending' | 'accepted' | 'rejected' | 'left' | 'invited' | 'declined';

interface PartyMember {
  id: number;
  user_id: number;
  username: string;
  avatar_url?: string | null;
  city: string | null;
  interests: string | null;
  status: MemberStatus;
  joined_at: string;
  message?: string | null;
  invited_by_user_id?: number | null;
  invite_message?: string | null;
}

interface Party {
  id: number;
  event_id: string;
  title: string;
  description: string | null;
  max_members: number;
  creator_id: number;
  creator_username: string;
  creator_avatar_url?: string | null;
  is_open: boolean;
  members: PartyMember[];
  event_title?: string | null;
  event_date_ts?: number | null;
  event_image_url?: string | null;
  invite_token?: string | null;
  created_at: string;
}

// ─── JoinModal ─────────────────────────────────────────────────────
function JoinModal({
  partyId,
  partyTitle,
  onClose,
  onJoined,
}: {
  partyId: number;
  partyTitle: string;
  onClose: () => void;
  onJoined: () => void;
}) {
  const { token } = useAuth();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const MAX = 100;

  const handleSubmit = async () => {
    if (!token) { window.location.href = '/login'; return; }
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/parties/${partyId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() || null }),
      });
      if (res.ok) {
        toast('Заявка отправлена!', 'info');
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
            <span className="font-bold">{partyTitle}</span>.
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

// ─── KickModal ─────────────────────────────────────────────────────
function KickModal({
  member, partyId, token, onClose, onKicked,
}: {
  member: PartyMember; partyId: number; token: string;
  onClose: () => void; onKicked: () => void;
}) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleKick = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/parties/${partyId}/members/${member.user_id}/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      if (res.ok) { toast(`${member.username} исключён из компании`, 'info'); onKicked(); onClose(); }
      else { const d = await res.json(); toast(extractApiErrorMessage(d.detail), 'error'); }
    } catch {}
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="px-6 py-4 bg-gradient-to-r from-red-500 to-pink-600 flex items-center justify-between">
          <h3 className="text-white font-black text-base">Исключить участника</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white transition text-xl">✕</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <p className="text-sm" style={{ color: 'var(--text)' }}>
            Вы собираетесь исключить <span className="font-bold">{member.username}</span> из компании.
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Причина (необязательно)
            </label>
            <textarea
              className="gv-input resize-none"
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
            onClick={handleKick} disabled={loading}
            className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-pink-600 py-2.5 text-sm text-white font-bold hover:opacity-90 transition disabled:opacity-50">
            {loading ? 'Исключение...' : 'Исключить'}
          </button>
          <button
            onClick={onClose} disabled={loading}
            className="rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 hover:opacity-80"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EditPartyModal ───────────────────────────────────────────────────
function EditPartyModal({ party, onClose, onSaved }: { party: Party; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ title: party.title, description: party.description ?? '', max_members: party.max_members });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const acceptedCount = party.members.filter(m => m.status === 'accepted').length + 1;

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Название обязательно'); return; }
    setSaving(true); setError(null);
    try {
      const res = await apiFetch(`${API_BASE}/parties/${party.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title.trim(), description: form.description.trim() || null, max_members: form.max_members }),
      });
      if (!res.ok) { const d = await res.json(); setError(extractApiErrorMessage(d.detail)); }
      else { toast('Изменения сохранены', 'success'); onSaved(); onClose(); }
    } catch { setError('Ошибка сети'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!window.confirm('Удалить компанию?')) return;
    setDeleting(true);
    try {
      await apiFetch(`${API_BASE}/parties/${party.id}`, { method: 'DELETE' });
      toast('Компания удалена', 'info');
      onSaved(); onClose();
      router.push(`/events/${party.event_id}`);
    } catch { setError('Ошибка удаления'); }
    setDeleting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center justify-between">
          <h3 className="text-white font-black text-base">Редактировать компанию</h3>
          <button onClick={onClose} className="text-white/70 hover:text-white transition text-xl">✕</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          {error && (
            <div className="rounded-xl px-4 py-2.5 text-sm"
              style={{ background: 'var(--error-hl)', border: '1px solid color-mix(in oklch, var(--error) 30%, transparent)', color: 'var(--error)' }}>
              {error}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Название *</label>
            <input className="gv-input" value={form.title} maxLength={60}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Описание</label>
            <textarea className="gv-input resize-none" rows={3} maxLength={300}
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Макс. участников</label>
            <div className="flex items-center gap-3">
              <input type="number" min={Math.max(2, acceptedCount)} max={20} className="gv-input w-24"
                value={form.max_members}
                onChange={e => setForm(f => ({ ...f, max_members: Math.min(20, Math.max(2, Number(e.target.value))) }))} />
              <span className="text-xs" style={{ color: 'var(--text-faint)' }}>Принято: {acceptedCount}</span>
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={handleSave} disabled={saving || deleting}
            className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-sm text-white font-bold hover:opacity-90 transition disabled:opacity-50">
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
          <button onClick={onClose} disabled={saving || deleting}
            className="rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 hover:opacity-80"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}>
            Отмена
          </button>
          <button onClick={handleDelete} disabled={saving || deleting}
            className="rounded-xl px-3 py-2.5 text-sm transition disabled:opacity-50 hover:opacity-80"
            style={{ border: '1px solid color-mix(in oklch, var(--error) 40%, transparent)', color: 'var(--error)', background: 'var(--error-hl)' }}>
            {deleting ? '...' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PartyDetailPage ───────────────────────────────────────────────────
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
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [kickTarget, setKickTarget] = useState<PartyMember | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [justAccepted, setJustAccepted] = useState(false);
  const prevPartyRef = useRef<Party | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const selfLeftRef = useRef(false);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewableUsers, setReviewableUsers] = useState<ReviewableUser[]>([]);
  const [reviewableLoading, setReviewableLoading] = useState(false);

  const fetchParty = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE}/parties/detail/${partyId}`);
      if (!res.ok) throw new Error(`Ошибка ${res.status}`);
      const data: Party = await res.json();
      if (token && prevPartyRef.current) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const uid: number = payload.id ?? payload.user_id;
          const oldMe = prevPartyRef.current.members.find(m => m.user_id === uid);
          const newMe = data.members.find(m => m.user_id === uid);
          if (oldMe?.status === 'pending' && newMe?.status === 'accepted') {
            toast('Вас приняли в компанию!', 'success');
            setJustAccepted(true);
          }
          if (oldMe?.status === 'pending' && !newMe) toast('Ваша заявка отклонена', 'error');
          if (oldMe?.status === 'accepted' && !newMe && !selfLeftRef.current) {
            toast('Вы были исключены из компании', 'error');
          }
          // One-shot: reset after each fetch so only the immediate post-leave poll is suppressed
          if (selfLeftRef.current && oldMe?.status === 'accepted' && !newMe) {
            selfLeftRef.current = false;
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

  const loadReviewableForParty = useCallback(async (pid: number) => {
    if (!token) return;
    setReviewableLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/users/me/reviewable`);
      if (!res.ok) {
        setReviewableUsers([]);
        return;
      }
      const all = await res.json() as ReviewableUser[];
      setReviewableUsers(all.filter(u => u.party_id === pid));
    } catch {
      setReviewableUsers([]);
    } finally {
      setReviewableLoading(false);
    }
  }, [token]);

  // Инициализируем socketRef для компонентов координации
  useEffect(() => {
    socketRef.current = getSocket();
  }, []);

  // Слушаем party_deleted — чтобы участники узнали о роспуске в реальном времени
  useEffect(() => {
    if (!partyId || !token) return;
    const socket: Socket = getSocket();

    const onPartyDeleted = (data: PartyDeletedPayload) => {
      toast(`Компания "${data.party_title}" была распущена создателем`, 'error');
      setTimeout(() => {
        router.push(`/events/${party?.event_id ?? ''}`);
      }, 3000);
    };

    socket.on('party_deleted', onPartyDeleted);

    return () => { socket.off('party_deleted', onPartyDeleted); };
  }, [partyId, token, party?.event_id, router]);

  const handleLeave = async () => {
    if (!token) return;
    setActionLoading(true);
    selfLeftRef.current = true;
    try {
      const res = await apiFetch(`${API_BASE}/parties/${partyId}/leave`, { method: 'DELETE' });
      if (res.ok) { toast('Вы покинули компанию', 'info'); setChatOpen(false); fetchParty(); }
      else {
        selfLeftRef.current = false;
        const d = await res.json();
        toast(extractApiErrorMessage(d.detail), 'error');
      }
    } catch {
      selfLeftRef.current = false;
    }
    setActionLoading(false);
  };

  const handleClose = async () => {
    if (!token) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/parties/${partyId}/close`, { method: 'POST' });
      if (res.ok) { toast('Набор закрыт', 'info'); fetchParty(); }
      else { const d = await res.json(); toast(extractApiErrorMessage(d.detail), 'error'); }
    } catch {}
    setActionLoading(false);
  };

  const handleDecision = async (userId: number, action: 'accept' | 'reject') => {
    if (!token) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/parties/${partyId}/members/${userId}/${action}`, { method: 'POST' });
      if (res.ok) { toast(action === 'accept' ? 'Принят' : 'Отклонён', action === 'accept' ? 'success' : 'error'); fetchParty(); }
      else { const d = await res.json(); toast(extractApiErrorMessage(d.detail), 'error'); }
    } catch {}
    setActionLoading(false);
  };

  const handleCancelInvite = async (inviteId: number) => {
    if (!token) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/parties/${partyId}/invites/${inviteId}`, { method: 'DELETE' });
      if (res.ok) {
        toast('Приглашение отозвано', 'info');
        fetchParty();
      } else {
        const d = await res.json().catch(() => ({}));
        toast(extractApiErrorMessage(d.detail), 'error');
      }
    } catch {}
    setActionLoading(false);
  };

  // Derived state must be declared before any early returns,
  // otherwise React will see different Hook order between renders.
  const isCreator = !!party && myId !== null && party.creator_id === myId;
  const myMembership = party?.members.find(m => m.user_id === myId);
  const isAcceptedMember = isCreator || myMembership?.status === 'accepted';
  const acceptedCount = party ? party.members.filter(m => m.status === 'accepted').length : 0;
  const pendingCount = party ? party.members.filter(m => m.status === 'pending').length : 0;
  const invitedCount = party ? party.members.filter(m => m.status === 'invited').length : 0;
  const isFull = party ? (acceptedCount + 1 >= party.max_members) : false;
  // Event ended: 2h after start. After that point, coordination tools are hidden,
  // and the party becomes a "memories mode" — only chat and recap remain.
  const ACTIVE_GRACE_SECONDS = 2 * 3600;
  const eventEnded = !!party?.event_date_ts
    && (Date.now() / 1000) > (party.event_date_ts + ACTIVE_GRACE_SECONDS);
  const canJoin = !!party && !!token && !isCreator && !myMembership && party.is_open && !isFull && !eventEnded;
  const canLeave = !!party && !!token && !isCreator && myMembership?.status === 'accepted' && !eventEnded;

  useEffect(() => {
    if (!token) return;
    if (!partyId) return;
    if (!eventEnded) return;
    if (!isAcceptedMember) return;
    loadReviewableForParty(partyId);
  }, [partyId, token, eventEnded, isAcceptedMember, loadReviewableForParty]);

  const handleCloseReviewModal = useCallback(() => {
    setReviewModalOpen(false);
    if (token && eventEnded && isAcceptedMember) {
      loadReviewableForParty(partyId);
    }
  }, [token, eventEnded, isAcceptedMember, loadReviewableForParty, partyId]);

  // ── Loading skeleton ──
  if (loading) return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="container mx-auto px-4 py-10 animate-pulse">
        <div className="h-4 w-40 rounded mb-8" style={{ background: 'var(--surface-2)' }} />
        <div className="h-8 rounded w-1/2 mb-4" style={{ background: 'var(--surface-2)' }} />
        <div className="h-4 rounded w-1/3 mb-8" style={{ background: 'var(--surface-2)' }} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-16 rounded-2xl" style={{ background: 'var(--surface-2)' }} />)}
          </div>
          <div className="space-y-3">
            {[1,2].map(i => <div key={i} className="h-24 rounded-2xl" style={{ background: 'var(--surface-2)' }} />)}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Error state ──
  if (error || !party) return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <span className="text-5xl">⚠️</span>
        <p style={{ color: 'var(--text-muted)' }}>Не удалось загрузить компанию</p>
        <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
        <button onClick={() => router.back()} className="gv-btn-primary">
          Назад
        </button>
      </div>
    </div>
  );

  const partyStatus = eventEnded
    ? 'finished'
    : !party.is_open
      ? 'closed'
      : isFull
        ? 'full'
        : 'open';

  const partyStatusLabel = {
    open: 'Набор открыт',
    full: 'Мест нет',
    closed: 'Набор закрыт',
    finished: 'Событие завершено',
  }[partyStatus];

  const partyStatusColor = {
    open: 'var(--success)',
    full: 'var(--warning)',
    closed: 'var(--text-faint)',
    finished: 'var(--primary)',
  }[partyStatus];

  const nextStepHint = !token
    ? 'Войдите в аккаунт, чтобы подать заявку или принять приглашение.'
    : isCreator
      ? 'Вы управляете компанией.'
      : myMembership?.status === 'pending'
        ? 'Заявка отправлена. Дождитесь решения создателя компании.'
        : myMembership?.status === 'accepted'
          ? 'Вы участник. Используйте чат и блок координации ниже.'
          : canJoin
            ? 'Похоже, компания вам подходит. Можно отправить заявку прямо сейчас.'
            : 'Сейчас вступление недоступно. Проверьте статус набора и количество мест.';

  const statusBadgeStyle = (status: string): React.CSSProperties => ({
    pending:  { background: 'var(--warning-hl)',  color: 'var(--warning)',  border: '1px solid color-mix(in oklch, var(--warning) 30%, transparent)' },
    accepted: { background: 'var(--success-hl)',  color: 'var(--success)',  border: '1px solid color-mix(in oklch, var(--success) 30%, transparent)' },
    rejected: { background: 'var(--error-hl)',    color: 'var(--error)',    border: '1px solid color-mix(in oklch, var(--error) 30%, transparent)' },
    invited:  { background: 'var(--primary-hl)',  color: 'var(--primary)',  border: '1px solid color-mix(in oklch, var(--primary) 30%, transparent)' },
    declined: { background: 'var(--surface-2)',   color: 'var(--text-muted)', border: '1px solid var(--border)' },
  }[status] ?? {});

  const statusLabel = (status: string) => ({
    pending: 'Ожидает',
    accepted: 'Принят',
    rejected: 'Отклонён',
    invited: 'Приглашён',
    declined: 'Отказался',
  }[status] ?? status);

  const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' };
  const myRowStyle: React.CSSProperties = { background: 'color-mix(in oklch, var(--primary) 8%, var(--surface))', border: '1px solid color-mix(in oklch, var(--primary) 25%, transparent)' };
  const normalRowStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)' };
  const eventMeta = buildEventIdentityMeta({
    eventId: party.event_id,
    eventTitle: party.event_title,
    eventDateTs: party.event_date_ts,
  });

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <main className="container mx-auto px-4 py-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          <Link href="/events" className="transition hover:opacity-80" style={{ color: 'var(--text-muted)' }}>События</Link>
          <span>/</span>
          <Link href={`/events/${party.event_id}`} className="transition hover:opacity-80 line-clamp-1 max-w-xs" style={{ color: 'var(--text-muted)' }}>
            {eventMeta.title}
          </Link>
          <span>/</span>
          <span className="line-clamp-1 max-w-xs" style={{ color: 'var(--text)' }}>{party.title}</span>
        </nav>

        <PushPermissionPrompt trigger={justAccepted} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT */}
          <div className="lg:col-span-2 space-y-6">
            {/* Header card */}
            <div className="rounded-2xl p-6" style={cardStyle}>
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-3xl shrink-0">🎉</div>
                <div className="flex-1 min-w-0">
                  <div
                    className="mb-3 rounded-xl p-3 flex items-start justify-between gap-3 flex-wrap"
                    style={{
                      border: '1px solid var(--border)',
                      background: 'var(--surface-2)',
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
                        Событие
                      </p>
                      <p className="text-sm font-semibold line-clamp-2" style={{ color: 'var(--text)' }}>
                        {eventMeta.title}
                      </p>
                      {eventMeta.dateLabel && (
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                          {eventMeta.dateLabel}
                        </p>
                      )}
                    </div>
                    <Link
                      href={eventMeta.href}
                      className="text-xs font-semibold whitespace-nowrap"
                      style={{ color: 'var(--primary)' }}
                    >
                      К событию →
                    </Link>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>{party.title}</h1>
                    {eventEnded && (
                      <span className="text-sm px-3 py-1 rounded-full font-semibold"
                        style={{ background: 'var(--primary-hl)', color: 'var(--primary)', border: '1px solid color-mix(in oklch, var(--primary) 30%, transparent)' }}>
                        Событие завершено
                      </span>
                    )}
                    {!eventEnded && !party.is_open && (
                      <span className="text-sm px-3 py-1 rounded-full"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Набор закрыт</span>
                    )}
                    {!eventEnded && isFull && party.is_open && (
                      <span className="text-sm px-3 py-1 rounded-full"
                        style={{ background: 'var(--warning-hl)', color: 'var(--warning)' }}>Заполнена</span>
                    )}
                  </div>
                  {party.description && (
                    <p className="mt-2" style={{ color: 'var(--text-muted)' }}>{party.description}</p>
                  )}
                  <p className="text-sm mt-2" style={{ color: 'var(--text-faint)' }}>
                    Создатель: <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>{party.creator_username}</span>
                    {' · '}{acceptedCount + 1}/{party.max_members} участников
                    {' · '}Создана {new Date(party.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
                {isCreator && !eventEnded && (
                  <div className="shrink-0 flex flex-col gap-2">
                  </div>
                )}
              </div>
            </div>

            {/* Members list */}
            <div className="rounded-2xl p-6" style={cardStyle}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold" style={{ color: 'var(--text)' }}>Участники</h2>
                <div className="flex items-center gap-2">
                  {eventEnded && isAcceptedMember && reviewableUsers.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setReviewModalOpen(true)}
                      disabled={reviewableLoading}
                      className="text-sm px-3 py-1.5 rounded-xl transition hover:opacity-80"
                      style={{
                        border: '1px solid var(--primary)',
                        color: 'var(--primary)',
                        background: 'var(--primary-hl)',
                        opacity: reviewableLoading ? 0.6 : 1,
                      }}
                    >
                      Оценить участников
                    </button>
                  )}

                  {isCreator && !eventEnded && (
                    <div className="flex gap-2">
                      {pendingCount > 0 && (
                        <span className="text-xs px-2 py-1 rounded-full font-semibold"
                          style={{ background: 'var(--warning-hl)', color: 'var(--warning)', border: '1px solid color-mix(in oklch, var(--warning) 30%, transparent)' }}>
                          {pendingCount} ожидают
                        </span>
                      )}
                      {invitedCount > 0 && (
                        <span className="text-xs px-2 py-1 rounded-full font-semibold"
                          style={{ background: 'var(--primary-hl)', color: 'var(--primary)', border: '1px solid color-mix(in oklch, var(--primary) 30%, transparent)' }}>
                          {invitedCount} приглашено
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-3">
                {/* Creator row */}
                <div className="flex items-center gap-3 p-3 rounded-xl"
                  style={isCreator ? myRowStyle : normalRowStyle}>
                  {party.creator_avatar_url ? (
                    <img
                      src={toMediaUrl(party.creator_avatar_url) || undefined}
                      alt={party.creator_username}
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {party.creator_username.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                      {party.creator_username}
                      {isCreator && <span className="ml-1 text-xs" style={{ color: 'var(--primary)' }}>(вы)</span>}
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--primary-hl)', color: 'var(--primary)', border: '1px solid color-mix(in oklch, var(--primary) 30%, transparent)' }}>
                    Создатель
                  </span>
                </div>

                {/* Other members */}
                {party.members
                  .filter(m => isCreator ? true : m.status === 'accepted' || m.user_id === myId)
                  .map(member => (
                  <div key={member.id ?? member.user_id} className="flex flex-col gap-2 p-3 rounded-xl"
                    style={member.user_id === myId ? myRowStyle : normalRowStyle}>
                    <div className="flex items-center gap-3">
                      {member.avatar_url ? (
                        <img
                          src={toMediaUrl(member.avatar_url) || undefined}
                          alt={member.username}
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {member.username.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                          {member.username}
                          {member.user_id === myId && <span className="ml-1 text-xs" style={{ color: 'var(--primary)' }}>(вы)</span>}
                        </p>
                        {member.city && <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{member.city}</p>}
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={statusBadgeStyle(member.status)}>
                        {statusLabel(member.status)}
                      </span>
                      {isCreator && !eventEnded && member.status === 'pending' && (
                        <div className="flex gap-1 ml-1">
                          <button onClick={() => handleDecision(member.user_id, 'accept')} disabled={actionLoading}
                            className="text-xs px-2 py-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition disabled:opacity-50" title="Принять">✓</button>
                          <button onClick={() => handleDecision(member.user_id, 'reject')} disabled={actionLoading}
                            className="text-xs px-2 py-1 bg-red-400 text-white rounded-lg hover:bg-red-500 transition disabled:opacity-50" title="Отклонить">✗</button>
                        </div>
                      )}
                      {isCreator && !eventEnded && member.status === 'accepted' && (
                        <button onClick={() => setKickTarget(member)} disabled={actionLoading}
                          className="ml-1 text-xs px-2 py-1 rounded-lg transition disabled:opacity-50 hover:opacity-80"
                          style={{ background: 'var(--error-hl)', color: 'var(--error)', border: '1px solid color-mix(in oklch, var(--error) 30%, transparent)' }}
                          title="Исключить">Исключить</button>
                      )}
                      {isCreator && !eventEnded && member.status === 'invited' && (
                        <button onClick={() => handleCancelInvite(member.id)} disabled={actionLoading}
                          className="ml-1 text-xs px-2 py-1 rounded-lg transition disabled:opacity-50 hover:opacity-80"
                          style={{ background: 'var(--error-hl)', color: 'var(--error)', border: '1px solid color-mix(in oklch, var(--error) 30%, transparent)' }}
                          title="Отозвать приглашение">Отозвать</button>
                      )}
                    </div>
                    {/* Show join message if present and viewer is creator */}
                    {isCreator && member.status === 'pending' && member.message && (
                      <div
                        className="ml-12 text-xs px-3 py-2 rounded-xl italic"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                      >
                        «{member.message}»
                      </div>
                    )}
                    {/* Show invite message if present and viewer is creator */}
                    {isCreator && member.status === 'invited' && member.invite_message && (
                      <div
                        className="ml-12 text-xs px-3 py-2 rounded-xl italic"
                        style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                      >
                        «{member.invite_message}»
                      </div>
                    )}
                  </div>
                ))}
                {party.members.length === 0 && (
                  <p className="text-sm text-center py-4" style={{ color: 'var(--text-faint)' }}>Участников пока нет. Будьте первым!</p>
                )}
              </div>
            </div>

            {/* Event-ended banner */}
            {eventEnded && isAcceptedMember && (
              <div
                className="rounded-2xl p-5 flex items-center gap-3"
                style={{
                  background: 'color-mix(in oklch, var(--primary) 10%, var(--surface))',
                  border: '1px solid color-mix(in oklch, var(--primary) 35%, transparent)',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold" style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}>✓</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold" style={{ color: 'var(--primary)' }}>Событие завершено</p>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Координация больше не нужна — теперь делитесь фото и впечатлениями в воспоминаниях ниже.
                  </p>
                </div>
              </div>
            )}

            {/* Coordination layer — hidden after the event ends */}
            {isAcceptedMember && user && !eventEnded && (
              <div className="space-y-4">
                <PartyMeetingPlan
                  partyId={party.id}
                  isCreator={isCreator}
                  socket={socketRef.current}
                />
                <PinnedBlock
                  partyId={party.id}
                  isCreator={isCreator}
                  socket={socketRef.current}
                />
                <AttendanceBar
                  partyId={party.id}
                  partyMembers={party.members}
                  creatorId={party.creator_id}
                  creatorUsername={party.creator_username}
                  currentUserId={myId}
                  socket={socketRef.current}
                />
                <ActivePoll
                  partyId={party.id}
                  isCreator={isCreator}
                  currentUserId={myId}
                  socket={socketRef.current}
                />
              </div>
            )}

            {/* Chat */}
            {isAcceptedMember && user && (
              <div className="rounded-2xl overflow-hidden" style={cardStyle}>
                <button
                  onClick={() => setChatOpen(v => !v)}
                  className="w-full px-6 py-4 flex items-center justify-between font-semibold text-sm transition"
                  style={{
                    background: chatOpen ? 'color-mix(in oklch, var(--primary) 8%, var(--surface))' : 'var(--surface)',
                    color: chatOpen ? 'var(--primary)' : 'var(--text)',
                  }}>
                  <span>Чат компании</span>
                  <span style={{ color: 'var(--text-faint)' }}>{chatOpen ? '▲' : '▼'}</span>
                </button>
                {chatOpen && (
                  <PartyChat partyId={party.id} currentUserId={myId} currentUsername={myUsername} isAcceptedMember={true} />
                )}
              </div>
            )}

            {/* Recap (memories) */}
            {isAcceptedMember && (
              <PartyRecapTab partyId={party.id} isCreator={isCreator} myUserId={myId} />
            )}
          </div>

          {/* RIGHT */}
          <div className="space-y-5">
            {/* Summary & Info */}
            <div
              className="rounded-2xl p-6 space-y-3"
              style={{
                ...cardStyle,
                background: 'linear-gradient(180deg, color-mix(in oklch, var(--primary) 8%, var(--surface)), var(--surface))',
              }}
            >
              <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Состояние компании
              </h3>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--text-muted)' }}>Текущий статус</span>
                <span className="font-semibold" style={{ color: partyStatusColor }}>{partyStatusLabel}</span>
              </div>
              <div className="flex items-center justify-between text-sm" style={{ borderTop: '1px solid var(--divider)', paddingTop: '0.75rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Участников</span>
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{acceptedCount + 1} / {party.max_members}</span>
              </div>
              {!eventEnded && (
                <div className="flex items-center justify-between text-sm" style={{ borderTop: '1px solid var(--divider)', paddingTop: '0.75rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Заявок</span>
                  <span className="font-semibold" style={{ color: 'var(--warning)' }}>{pendingCount}</span>
                </div>
              )}
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                {nextStepHint}
              </p>
            </div>

            {/* Actions */}
            <div className="rounded-2xl p-6 space-y-3" style={cardStyle}>
              <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Действия</h3>
              {canJoin && (
                <button onClick={() => setShowJoinModal(true)} disabled={actionLoading}
                  className="w-full gv-btn-primary text-sm py-2.5">
                  {actionLoading ? 'Отправка...' : 'Подать заявку'}
                </button>
              )}
              {canLeave && (
                <button onClick={handleLeave} disabled={actionLoading}
                  className="w-full text-sm py-2.5 rounded-xl transition disabled:opacity-60 hover:opacity-80"
                  style={{ color: 'var(--error)', border: '1px solid color-mix(in oklch, var(--error) 40%, transparent)', background: 'var(--error-hl)' }}>
                  {actionLoading ? '...' : 'Покинуть компанию'}
                </button>
              )}
              {isCreator && party.is_open && !eventEnded && (
                <button onClick={handleClose} disabled={actionLoading}
                  className="w-full text-sm py-2.5 rounded-xl transition disabled:opacity-60 hover:opacity-80"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  Закрыть набор
                </button>
              )}
              {isCreator && !eventEnded && (
                <button onClick={() => setShowEdit(true)}
                  className="w-full text-sm py-2.5 rounded-xl transition hover:opacity-80"
                  style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}>
                  Редактировать
                </button>
              )}
              {isCreator && party.invite_token && !eventEnded && (
                <button
                  onClick={async () => {
                    const link = `${window.location.origin}/invite/${party.invite_token}`;
                    try {
                      await navigator.clipboard.writeText(link);
                      toast('Ссылка скопирована — отправь её в любой мессенджер', 'success');
                    } catch {
                      window.prompt('Скопируйте ссылку вручную:', link);
                    }
                  }}
                  className="w-full text-sm py-2.5 rounded-xl transition hover:opacity-80"
                  style={{ border: '1px solid var(--primary)', color: 'var(--primary)', background: 'var(--primary-hl)' }}
                >
                  Скопировать ссылку
                </button>
              )}
              {myMembership?.status === 'pending' && !eventEnded && (
                <p className="text-xs text-center" style={{ color: 'var(--warning)' }}>Ваша заявка рассматривается</p>
              )}
              {eventEnded && (
                <p className="text-xs text-center" style={{ color: 'var(--text-faint)' }}>
                  Событие завершено — управление компанией закрыто
                </p>
              )}
              {!token && (
                <Link href="/login"
                  className="block w-full text-center text-sm py-2.5 rounded-xl font-semibold transition hover:opacity-90"
                  style={{ background: 'var(--primary)', color: 'var(--text-inverse)' }}>
                  Войти чтобы вступить
                </Link>
              )}
            </div>


            {/* Back to event */}
            <Link
              href={`/events/${party.event_id}`}
              className="block w-full text-center text-sm py-2.5 rounded-xl transition hover:opacity-80"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}>
              ← Вернуться к событию
            </Link>
          </div>
        </div>
      </main>

      {reviewModalOpen && (
        <ReviewModal
          users={reviewableUsers}
          onClose={handleCloseReviewModal}
          onAllReviewed={() => {
            setReviewableUsers([]);
            setReviewModalOpen(false);
          }}
        />
      )}
      {showJoinModal && party && (
        <JoinModal
          partyId={partyId}
          partyTitle={party.title}
          onClose={() => setShowJoinModal(false)}
          onJoined={fetchParty}
        />
      )}
      {showEdit && party && (
        <EditPartyModal party={party} onClose={() => setShowEdit(false)} onSaved={fetchParty} />
      )}
      {kickTarget && token && (
        <KickModal member={kickTarget} partyId={partyId} token={token}
          onClose={() => setKickTarget(null)} onKicked={fetchParty} />
      )}
    </div>
  );
}

