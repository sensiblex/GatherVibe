'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { apiFetch } from '../lib/apiFetch';
import { getInterestLabel } from '../lib/interests';
import { sendInvite } from '../lib/partyInviteApi';
import { extractApiErrorMessage } from '../lib/apiErrors';
import { toast } from './Toast';
import { resolveApiBase } from '../lib/apiBase';

const API_BASE = resolveApiBase();

function toMediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  // For uploads, don't add /api prefix since they're served directly
  if (path.startsWith('/uploads/')) return path;
  return `${API_BASE}${path}`;
}

interface Attendee {
  id: number;
  user_id: number;
  username: string;
  avatar_url?: string | null;
  city: string | null;
  interests: string | null;
  comment: string | null;
  is_looking: boolean;
  created_at: string;
}

type PartyMemberInviteStatus = 'pending' | 'accepted' | 'rejected' | 'left' | 'invited' | 'declined';

interface InviteMemberState {
  user_id: number;
  status: PartyMemberInviteStatus;
}

interface MyStatus {
  attending: boolean;
  is_looking?: boolean;
  comment?: string | null;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function splitInterests(raw: string | null | undefined): string[] {
  return (raw || '').split(',').map(s => s.trim()).filter(Boolean);
}

function calcMatchScore(myTags: string[], attendee: Attendee, myUserId: number | null): number {
  if (attendee.user_id === myUserId || !myTags.length) return 0;
  const theirTags = splitInterests(attendee.interests);
  return myTags.filter(t => theirTags.includes(t)).length;
}

// ─── sub-components ─────────────────────────────────────────────────────────

function InterestBadge({ interest, highlight }: { interest: string; highlight?: boolean }) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{
        background: highlight ? 'var(--accent, #4f46e5)' : 'var(--badge-bg, #eef2ff)',
        color: highlight ? '#fff' : 'var(--accent, #4f46e5)',
      }}
    >
      {getInterestLabel(interest.trim())}
    </span>
  );
}

function CompatibilityBar({ score }: { score: number }) {
  if (score === 0) return null;
  const pct = Math.min(100, Math.round(score * 20));
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 h-1.5 rounded-full overflow-hidden"
        style={{ background: 'var(--surface-2)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, var(--accent, #4f46e5), #9333ea)',
          }}
        />
      </div>
      <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--accent)' }}>
        {score} совп.
      </span>
    </div>
  );
}

function AttendeeCard({
  attendee,
  isMe,
  isTopMatch,
  commonInterests,
  matchScore,
  canInvite,
  inviteLabel,
  inviteDisabled,
  onInvite,
}: {
  attendee: Attendee;
  isMe: boolean;
  isTopMatch: boolean;
  commonInterests: string[];
  matchScore: number;
  canInvite: boolean;
  inviteLabel?: string;
  inviteDisabled?: boolean;
  onInvite?: (userId: number) => void;
}) {
  const initials = attendee.username.slice(0, 2).toUpperCase();
  const interests = attendee.interests
    ? attendee.interests.split(',').filter(Boolean).slice(0, 5)
    : [];

  const borderColor = isMe
    ? 'var(--accent, #4f46e5)'
    : isTopMatch
    ? '#d8b4fe'
    : commonInterests.length > 0
    ? 'color-mix(in oklch, #9333ea 50%, var(--border))'
    : 'var(--border)';

  const boxShadow = isTopMatch
    ? '0 0 0 2px #d8b4fe, 0 2px 8px 0 rgba(168,85,247,0.10)'
    : undefined;

  const bgColor = isMe
    ? 'color-mix(in oklch, var(--accent, #4f46e5) 8%, var(--surface))'
    : isTopMatch
    ? 'color-mix(in oklch, #9333ea 7%, var(--surface))'
    : commonInterests.length > 0
    ? 'color-mix(in oklch, #9333ea 5%, var(--surface))'
    : 'var(--surface)';

  return (
    <div
      className="relative flex flex-col gap-3 p-4 rounded-2xl transition-all hover:-translate-y-0.5"
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        boxShadow,
      }}
    >
      {/* Labels */}
      {isMe && (
        <span
          className="absolute top-3 right-3 text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'var(--badge-bg, #eef2ff)', color: 'var(--accent, #4f46e5)' }}
        >
          Вы
        </span>
      )}
      {!isMe && isTopMatch && (
        <span className="absolute top-3 right-3 text-xs font-bold bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">
          ✨ Лучшее совпадение
        </span>
      )}
      {!isMe && !isTopMatch && commonInterests.length >= 2 && (
        <span className="absolute top-3 right-3 text-xs font-bold bg-purple-500/20 text-purple-500 px-2 py-0.5 rounded-full">
          🔥 Совпадение
        </span>
      )}

      {/* Avatar + name — имя кликабельно, ведёт на /users/[id] */}
      <div className="flex items-center gap-3">
        <Link
          href={`/users/${attendee.user_id}`}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 transition hover:opacity-80 overflow-hidden"
          style={{
            background:
              isTopMatch || commonInterests.length >= 2
                ? 'linear-gradient(135deg,#9333ea,#ec4899)'
                : 'linear-gradient(135deg,var(--accent,#4f46e5),#9333ea)',
          }}
          aria-label={`Профиль ${attendee.username}`}
        >
          {attendee.avatar_url ? (
            <img
              src={toMediaUrl(attendee.avatar_url) || undefined}
              alt={attendee.username}
              className="w-full h-full object-cover"
            />
          ) : (
            initials
          )}
        </Link>
        <div className="min-w-0">
          <Link
            href={`/users/${attendee.user_id}`}
            className="font-bold text-sm truncate block transition hover:opacity-70"
            style={{ color: 'var(--text)' }}
          >
            {attendee.username}
          </Link>
          {attendee.city && (
            <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <span>📍</span>{attendee.city}
            </p>
          )}
        </div>
      </div>

      {/* Compatibility bar */}
      {!isMe && commonInterests.length > 0 && (
        <CompatibilityBar score={commonInterests.length} />
      )}

      {/* Interest tags */}
      {interests.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {interests.map(i => (
            <InterestBadge key={i} interest={i} highlight={commonInterests.includes(i.trim())} />
          ))}
        </div>
      )}

      {!isMe && matchScore > 0 && (
        <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-semibold self-start">
          🔥 {matchScore} общих интереса
        </span>
      )}

      {attendee.comment && (
        <p className="text-sm italic leading-snug" style={{ color: 'var(--text-muted)' }}>
          «{attendee.comment}»
        </p>
      )}

      {attendee.is_looking && !isMe && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Ищет компанию
        </div>
      )}

      {canInvite && !isMe && (
        <button
          type="button"
          disabled={inviteDisabled}
          onClick={() => onInvite?.(attendee.user_id)}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-60"
          style={{
            background: inviteDisabled ? 'var(--surface-2)' : 'var(--primary-hl)',
            color: inviteDisabled ? 'var(--text-muted)' : 'var(--primary)',
            border: '1px solid color-mix(in oklch, var(--primary) 30%, transparent)',
          }}
        >
          {inviteLabel ?? 'Пригласить'}
        </button>
      )}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

interface EventMeta {
  title: string;
  date_ts: number | null;
  city: string | null;
  image_url: string | null;
  category: string | null;
  location: string | null;
}

export default function EventAttendees({
  eventId,
  eventMeta,
  partyId,
  partyCreatorId,
  partyMembers,
}: {
  eventId: string;
  eventMeta?: EventMeta;
  partyId?: number | null;
  partyCreatorId?: number | null;
  partyMembers?: InviteMemberState[];
}) {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [myStatus, setMyStatus] = useState<MyStatus>({ attending: false });
  const [myInterests, setMyInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [comment, setComment] = useState('');
  const [isLooking, setIsLooking] = useState(true);
  const [onlyLooking, setOnlyLooking] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'match'>('match');
  const [filterInterest, setFilterInterest] = useState<string>('');
  const [invitingUserIds, setInvitingUserIds] = useState<Set<number>>(new Set());
  const [locallyInvitedUserIds, setLocallyInvitedUserIds] = useState<Set<number>>(new Set());
  // `token` здесь только как маркер "залогинен ли". Реальный JWT в HttpOnly cookie.
  const [token, setToken] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<number | null>(null);

  useEffect(() => {
    // /users/me → и проверка сессии, и получение myUserId одним запросом.
    apiFetch('/users/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.id === 'number') {
          setToken('session');
          setMyUserId(data.id);
        } else {
          setToken(null);
          setMyUserId(null);
        }
      })
      .catch(() => { setToken(null); setMyUserId(null); });
  }, []);

  useEffect(() => {
    if (!token) return;
    apiFetch('/users/me')
      .then(r => (r.ok ? r.json() : null))
      .then(u => {
        if (u?.interests) setMyInterests(splitInterests(u.interests));
      })
      .catch(() => {});
  }, [token]);

  const fetchAttendees = useCallback(async () => {
    try {
      const res = await apiFetch(
        `/attendees/${eventId}${onlyLooking ? '?only_looking=true' : ''}`
      );
      if (res.ok) setAttendees(await res.json());
    } catch {}
  }, [eventId, onlyLooking]);

  const fetchMyStatus = useCallback(async () => {
    if (!token) { setMyStatus({ attending: false }); return; }
    try {
      const res = await apiFetch(`/attendees/${eventId}/me`);
      if (res.ok) {
        const data = await res.json();
        setMyStatus(data);
        if (data.attending) {
          setComment(data.comment || '');
          setIsLooking(data.is_looking ?? true);
        }
      }
    } catch {}
  }, [eventId, token]);

  const [tokenReady, setTokenReady] = useState(false);
  useEffect(() => { setTokenReady(true); }, [token]);

  useEffect(() => {
    if (!tokenReady) return;
    Promise.all([fetchAttendees(), fetchMyStatus()]).finally(() => setLoading(false));
  }, [fetchAttendees, fetchMyStatus, tokenReady]);

  const getMatchScore = useCallback(
    (attendee: Attendee): number => calcMatchScore(myInterests, attendee, myUserId),
    [myInterests, myUserId]
  );

  const getCommonInterests = useCallback(
    (attendee: Attendee): string[] => {
      if (attendee.user_id === myUserId || !myInterests.length) return [];
      const their = splitInterests(attendee.interests);
      return myInterests.filter(i => their.includes(i));
    },
    [myInterests, myUserId]
  );

  const allInterests = useMemo(() => {
    const set = new Set<string>();
    attendees.forEach(a => {
      if (a.interests) a.interests.split(',').forEach(i => set.add(i.trim()));
    });
    return Array.from(set).filter(Boolean).sort();
  }, [attendees]);

  const processedAttendees = useMemo(() => {
    let list = [...attendees];
    if (filterInterest) {
      list = list.filter(a =>
        a.interests?.split(',').map(s => s.trim()).includes(filterInterest)
      );
    }
    if (sortBy === 'match') {
      list.sort((a, b) => {
        if (a.user_id === myUserId) return -1;
        if (b.user_id === myUserId) return 1;
        return getMatchScore(b) - getMatchScore(a);
      });
    } else {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list;
  }, [attendees, sortBy, filterInterest, getMatchScore, myUserId]);

  const topMatchUserId = useMemo(() => {
    let best: Attendee | null = null;
    let bestScore = 0;
    for (const a of attendees) {
      if (a.user_id === myUserId) continue;
      const s = getMatchScore(a);
      if (s > bestScore) { bestScore = s; best = a; }
    }
    return bestScore > 0 ? best?.user_id ?? null : null;
  }, [attendees, getMatchScore, myUserId]);

  const canManageInvites = !!partyId && !!myUserId && partyCreatorId === myUserId;

  const partyMemberStatusByUserId = useMemo(() => {
    const map = new Map<number, PartyMemberInviteStatus>();
    (partyMembers ?? []).forEach((member) => map.set(member.user_id, member.status));
    return map;
  }, [partyMembers]);

  const resolveInviteState = useCallback((userId: number): { disabled: boolean; label: string } => {
    if (invitingUserIds.has(userId)) return { disabled: true, label: 'Отправка...' };
    const status = partyMemberStatusByUserId.get(userId);
    if (status === 'accepted') return { disabled: true, label: 'В группе' };
    if (status === 'invited') return { disabled: true, label: 'Уже приглашен' };
    if (status === 'pending') return { disabled: true, label: 'Заявка отправлена' };
    if (locallyInvitedUserIds.has(userId)) return { disabled: true, label: 'Уже приглашен' };
    return { disabled: false, label: 'Пригласить' };
  }, [invitingUserIds, locallyInvitedUserIds, partyMemberStatusByUserId]);

  const handleInvite = useCallback(async (userId: number) => {
    if (!partyId || !canManageInvites) return;
    const state = resolveInviteState(userId);
    if (state.disabled) return;

    setInvitingUserIds((prev) => new Set(prev).add(userId));
    try {
      const res = await sendInvite(partyId, userId, undefined);
      if (res.ok) {
        setLocallyInvitedUserIds((prev) => new Set(prev).add(userId));
        toast('Приглашение отправлено', 'success');
      } else {
        const data = await res.json().catch(() => ({}));
        toast(extractApiErrorMessage((data as { detail?: unknown }).detail), 'error');
      }
    } catch {
      toast('Ошибка сети при отправке приглашения', 'error');
    } finally {
      setInvitingUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }, [canManageInvites, partyId, resolveInviteState]);

  const handleJoin = async () => {
    if (!token) { window.location.href = '/login'; return; }
    setJoining(true);
    try {
      const res = await apiFetch(`/attendees/${eventId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment:         comment.trim() || null,
          is_looking:      isLooking,
          event_title:     eventMeta?.title     ?? null,
          event_date_ts:   eventMeta?.date_ts   ?? null,
          event_city:      eventMeta?.city       ?? null,
          event_image_url: eventMeta?.image_url  ?? null,
          event_category:  eventMeta?.category   ?? null,
          event_location:  eventMeta?.location   ?? null,
        }),
      });
      if (res.ok) {
        setMyStatus({ attending: true, is_looking: isLooking, comment: comment.trim() || null });
        setShowForm(false);
        await fetchAttendees();
      }
    } catch {}
    setJoining(false);
  };

  const handleLeave = async () => {
    if (!token) return;
    setJoining(true);
    try {
      await apiFetch(`/attendees/${eventId}`, { method: 'DELETE' });
      setMyStatus({ attending: false });
      setComment('');
      setShowForm(false);
      await fetchAttendees();
    } catch {}
    setJoining(false);
  };

  const lookingCount = attendees.filter(a => a.is_looking).length;

  const cardStyle = {
    background: 'var(--card-bg, var(--surface))',
    border: '1px solid var(--border)',
  };

  const sortBtnStyle = (active: boolean) => ({
    background: active ? 'var(--accent, #4f46e5)' : 'var(--surface)',
    color: active ? '#fff' : 'var(--text-muted)',
  });

  return (
    <div className="rounded-2xl shadow-sm overflow-hidden" style={cardStyle}>
      {/* ── Header ── */}
      <div
        className="px-6 py-5 flex flex-wrap items-center justify-between gap-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>
            🤝 Идут на событие
            {attendees.length > 0 && (
              <span className="ml-2 text-sm font-normal" style={{ color: 'var(--text-muted)' }}>
                {attendees.length} чел.
              </span>
            )}
          </h2>
          {lookingCount > 0 && (
            <p className="text-xs text-emerald-500 mt-0.5">{lookingCount} ищут компанию</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="flex rounded-xl overflow-hidden text-xs font-semibold"
            style={{ border: '1px solid var(--border)' }}
          >
            <button
              onClick={() => setSortBy('match')}
              className="px-3 py-1.5 transition"
              style={sortBtnStyle(sortBy === 'match')}
            >
              🎯 По совпадению
            </button>
            <button
              onClick={() => setSortBy('date')}
              className="px-3 py-1.5 transition"
              style={sortBtnStyle(sortBy === 'date')}
            >
              🕐 По дате
            </button>
          </div>

          <button
            onClick={() => setOnlyLooking(v => !v)}
            className="text-xs px-3 py-1.5 rounded-full font-medium transition"
            style={{
              background: onlyLooking ? 'color-mix(in oklch, #22c55e 15%, var(--surface))' : 'var(--surface-2)',
              border: `1px solid ${onlyLooking ? '#22c55e' : 'var(--border)'}`,
              color: onlyLooking ? '#22c55e' : 'var(--text-muted)',
            }}
          >
            {onlyLooking ? '✓ Только ищут' : 'Только ищут'}
          </button>

          {!myStatus.attending ? (
            <button
              onClick={() => token ? setShowForm(v => !v) : (window.location.href = '/login')}
              className="text-white text-sm font-bold px-4 py-1.5 rounded-full hover:opacity-90 shadow-sm transition"
              style={{ background: 'var(--accent-gradient, linear-gradient(135deg,#4f46e5,#7c3aed))' }}
            >
              + Иду!
            </button>
          ) : (
            <button
              onClick={() => setShowForm(v => !v)}
              className="text-sm font-bold px-4 py-1.5 rounded-full transition hover:opacity-80"
              style={{ border: '1px solid var(--accent, #4f46e5)', color: 'var(--accent, #4f46e5)' }}
            >
              ✏️ Изменить
            </button>
          )}
        </div>
      </div>

      {/* ── Interest filter chips ── */}
      {allInterests.length > 0 && (
        <div
          className="px-6 py-3 flex gap-2 flex-wrap"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <button
            onClick={() => setFilterInterest('')}
            className="text-xs px-3 py-1 rounded-full font-medium transition"
            style={{
              background: !filterInterest ? 'var(--accent, #4f46e5)' : 'var(--surface-2)',
              color: !filterInterest ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${!filterInterest ? 'var(--accent, #4f46e5)' : 'var(--border)'}`,
            }}
          >
            Все
          </button>
          {allInterests.map(int => (
            <button
              key={int}
              onClick={() => setFilterInterest(int === filterInterest ? '' : int)}
              className="text-xs px-3 py-1 rounded-full font-medium transition"
              style={{
                background:
                  filterInterest === int
                    ? 'var(--accent, #4f46e5)'
                    : myInterests.includes(int)
                    ? 'var(--badge-bg, #eef2ff)'
                    : 'var(--surface-2)',
                color:
                  filterInterest === int
                    ? '#fff'
                    : myInterests.includes(int)
                    ? 'var(--accent, #4f46e5)'
                    : 'var(--text-muted)',
                border: `1px solid ${filterInterest === int ? 'var(--accent, #4f46e5)' : 'var(--border)'}`,
              }}
            >
              {myInterests.includes(int) ? '⭐ ' : ''}{getInterestLabel(int)}
            </button>
          ))}
        </div>
      )}

      {/* ── Join / edit form ── */}
      {showForm && (
        <div
          className="px-6 py-4"
          style={{
            background: 'color-mix(in oklch, var(--accent, #4f46e5) 5%, var(--surface))',
            borderBottom: '1px solid color-mix(in oklch, var(--accent, #4f46e5) 20%, var(--border))',
          }}
        >
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
            {myStatus.attending ? 'Обновить участие' : 'Расскажи о себе другим участникам'}
          </p>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value.slice(0, 200))}
            placeholder="Коротко о себе или пожелания для компании (необязательно)"
            rows={2}
            className="w-full text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          />
          <p className="text-xs mb-3 text-right" style={{ color: 'var(--text-muted)' }}>
            {comment.length}/200
          </p>
          <label className="flex items-center gap-2 cursor-pointer mb-4">
            <div
              onClick={() => setIsLooking(v => !v)}
              className="w-10 h-5 rounded-full transition-colors relative"
              style={{ background: isLooking ? '#22c55e' : 'var(--surface-2)' }}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  isLooking ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </div>
            <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              Ищу компанию на это событие
            </span>
          </label>
          <div className="flex gap-2">
            {!myStatus.attending ? (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white hover:opacity-90 transition disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
              >
                {joining ? 'Сохранение...' : '✓ Подтвердить участие'}
              </button>
            ) : (
              <>
                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white hover:opacity-90 transition disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
                >
                  {joining ? 'Сохранение...' : '💾 Сохранить'}
                </button>
                <button
                  onClick={handleLeave}
                  disabled={joining}
                  className="px-4 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-60"
                  style={{
                    color: '#ef4444',
                    border: '1px solid color-mix(in oklch, #ef4444 40%, transparent)',
                  }}
                >
                  Отписаться
                </button>
              </>
            )}
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 rounded-xl text-sm transition"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* ── List ── */}
      <div className="p-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="h-28 rounded-2xl animate-pulse"
                style={{ background: 'var(--surface-2)' }}
              />
            ))}
          </div>
        ) : processedAttendees.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-4xl mb-3">🎭</p>
            <p className="font-medium" style={{ color: 'var(--text-muted)' }}>
              {onlyLooking ? 'Никто не ищет компанию' : 'Пока никто не идёт'}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Будь первым — нажми «+ Иду!»
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {processedAttendees.map(a => {
              const inviteState = resolveInviteState(a.user_id);
              return (
              <AttendeeCard
                key={a.id}
                attendee={a}
                isMe={a.user_id === myUserId}
                isTopMatch={a.user_id === topMatchUserId}
                commonInterests={getCommonInterests(a)}
                matchScore={getMatchScore(a)}
                canInvite={canManageInvites}
                inviteLabel={inviteState.label}
                inviteDisabled={inviteState.disabled}
                onInvite={handleInvite}
              />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
