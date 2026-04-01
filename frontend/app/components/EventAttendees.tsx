'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Attendee {
  id: number;
  user_id: number;
  username: string;
  city: string | null;
  interests: string | null;
  comment: string | null;
  is_looking: boolean;
  created_at: string;
}

interface MyStatus {
  attending: boolean;
  is_looking?: boolean;
  comment?: string | null;
}

function InterestBadge({ interest, highlight }: { interest: string; highlight?: boolean }) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{
        background: highlight ? 'var(--accent, #4f46e5)' : 'var(--badge-bg, #eef2ff)',
        color: highlight ? '#fff' : 'var(--accent, #4f46e5)',
      }}
    >
      {interest.trim()}
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
  commonInterests,
}: {
  attendee: Attendee;
  isMe: boolean;
  commonInterests: string[];
}) {
  const initials = attendee.username.slice(0, 2).toUpperCase();
  const interests = attendee.interests
    ? attendee.interests.split(',').filter(Boolean).slice(0, 5)
    : [];

  const borderColor = isMe
    ? 'var(--accent, #4f46e5)'
    : commonInterests.length > 0
    ? 'color-mix(in oklch, #9333ea 50%, var(--border))'
    : 'var(--border)';

  const bgColor = isMe
    ? 'color-mix(in oklch, var(--accent, #4f46e5) 8%, var(--surface))'
    : commonInterests.length > 0
    ? 'color-mix(in oklch, #9333ea 5%, var(--surface))'
    : 'var(--surface)';

  return (
    <div
      className="relative flex flex-col gap-3 p-4 rounded-2xl transition-all hover:-translate-y-0.5"
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
      }}
    >
      {isMe && (
        <span
          className="absolute top-3 right-3 text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'var(--badge-bg, #eef2ff)', color: 'var(--accent, #4f46e5)' }}
        >
          Вы
        </span>
      )}
      {!isMe && commonInterests.length >= 2 && (
        <span className="absolute top-3 right-3 text-xs font-bold bg-purple-500/20 text-purple-500 px-2 py-0.5 rounded-full">
          🔥 Совпадение
        </span>
      )}

      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{
            background: commonInterests.length >= 2
              ? 'linear-gradient(135deg,#9333ea,#ec4899)'
              : 'linear-gradient(135deg,var(--accent,#4f46e5),#9333ea)',
          }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm truncate" style={{ color: 'var(--text)' }}>
            {attendee.username}
          </p>
          {attendee.city && (
            <p className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              <span>📍</span>{attendee.city}
            </p>
          )}
        </div>
      </div>

      {!isMe && commonInterests.length > 0 && (
        <CompatibilityBar score={commonInterests.length} />
      )}

      {interests.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {interests.map((i) => (
            <InterestBadge key={i} interest={i} highlight={commonInterests.includes(i.trim())} />
          ))}
        </div>
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
    </div>
  );
}

export default function EventAttendees({ eventId }: { eventId: string }) {
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
  const [token, setToken] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<number | null>(null);

  useEffect(() => {
    const t = localStorage.getItem('token');
    setToken(t);
    if (t) {
      try {
        const payload = JSON.parse(atob(t.split('.')[1]));
        setMyUserId(payload.user_id ?? null);
      } catch {
        setMyUserId(null);
      }
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(u => {
        if (u?.interests)
          setMyInterests(u.interests.split(',').map((s: string) => s.trim()).filter(Boolean));
      })
      .catch(() => {});
  }, [token]);

  const fetchAttendees = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/attendees/${eventId}${onlyLooking ? '?only_looking=true' : ''}`);
      if (res.ok) setAttendees(await res.json());
    } catch {}
  }, [eventId, onlyLooking]);

  const fetchMyStatus = useCallback(async () => {
    if (!token) { setMyStatus({ attending: false }); return; }
    try {
      const res = await fetch(`${API_BASE}/attendees/${eventId}/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

  const getCommonInterests = useCallback(
    (attendee: Attendee): string[] => {
      if (!myInterests.length || !attendee.interests || attendee.user_id === myUserId) return [];
      const their = attendee.interests.split(',').map(s => s.trim()).filter(Boolean);
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
      list = list.filter(a => a.interests?.split(',').map(s => s.trim()).includes(filterInterest));
    }
    if (sortBy === 'match') {
      list.sort((a, b) => {
        const sa = getCommonInterests(a).length;
        const sb = getCommonInterests(b).length;
        if (sb !== sa) return sb - sa;
        if (a.user_id === myUserId) return -1;
        if (b.user_id === myUserId) return 1;
        return 0;
      });
    } else {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return list;
  }, [attendees, sortBy, filterInterest, getCommonInterests, myUserId]);

  const handleJoin = async () => {
    if (!token) { window.location.href = '/login'; return; }
    setJoining(true);
    try {
      const res = await fetch(`${API_BASE}/attendees/${eventId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment: comment.trim() || null, is_looking: isLooking }),
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
      await fetch(`${API_BASE}/attendees/${eventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
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
      {/* Header */}
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
          {/* Sort buttons */}
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

          {/* Only-looking filter */}
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
              style={{
                border: '1px solid var(--accent, #4f46e5)',
                color: 'var(--accent, #4f46e5)',
              }}
            >
              ✏️ Изменить
            </button>
          )}
        </div>
      </div>

      {/* Interest filter chips */}
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
                background: filterInterest === int ? 'var(--accent, #4f46e5)' : myInterests.includes(int) ? 'var(--badge-bg, #eef2ff)' : 'var(--surface-2)',
                color: filterInterest === int ? '#fff' : myInterests.includes(int) ? 'var(--accent, #4f46e5)' : 'var(--text-muted)',
                border: `1px solid ${filterInterest === int ? 'var(--accent, #4f46e5)' : 'var(--border)'}`,
              }}
            >
              {myInterests.includes(int) ? '⭐ ' : ''}{int}
            </button>
          ))}
        </div>
      )}

      {/* Join form */}
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
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
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
            <span className="text-sm" style={{ color: 'var(--text)' }}>
              {isLooking ? '🟢 Ищу компанию для похода' : '⚫ Просто отмечаюсь'}
            </span>
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleJoin} disabled={joining}
              className="flex-1 text-white text-sm font-bold py-2 rounded-xl hover:opacity-90 transition disabled:opacity-60"
              style={{ background: 'var(--accent-gradient, linear-gradient(135deg,#4f46e5,#7c3aed))' }}
            >
              {joining ? 'Сохранение...' : myStatus.attending ? 'Обновить' : 'Подтвердить участие'}
            </button>
            {myStatus.attending && (
              <button
                onClick={handleLeave} disabled={joining}
                className="px-4 text-sm rounded-xl transition disabled:opacity-60"
                style={{
                  color: '#ef4444',
                  border: '1px solid color-mix(in oklch, #ef4444 40%, transparent)',
                }}
              >
                Отменить
              </button>
            )}
            <button
              onClick={() => setShowForm(false)}
              className="px-4 text-sm rounded-xl transition hover:opacity-80"
              style={{
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Attendees list */}
      <div className="p-6">
        {myInterests.length > 0 && sortBy === 'match' && attendees.length > 1 && (
          <p className="text-xs mb-4 flex items-center gap-1" style={{ color: 'var(--accent)' }}>
            <span>🎯</span> Участники отсортированы по совпадению интересов с вашим профилем
          </p>
        )}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'var(--surface-2)' }} />
            ))}
          </div>
        ) : processedAttendees.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-4xl mb-3">🎭</p>
            <p className="font-medium" style={{ color: 'var(--text-muted)' }}>
              {filterInterest ? `Никого с интересом «${filterInterest}»` : 'Пока никто не отметился'}
            </p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {filterInterest ? 'Попробуй другой фильтр' : 'Будь первым — нажми «Иду!»'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {processedAttendees.map(a => (
              <AttendeeCard
                key={a.id}
                attendee={a}
                isMe={a.user_id === myUserId}
                commonInterests={getCommonInterests(a)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
