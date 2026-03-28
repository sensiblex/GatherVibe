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
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        highlight
          ? 'bg-indigo-500 text-white'
          : 'bg-indigo-50 text-indigo-600'
      }`}
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
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-indigo-500 font-semibold shrink-0">{score} совп.</span>
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

  return (
    <div
      className={`relative flex flex-col gap-3 p-4 rounded-2xl border transition-all ${
        isMe
          ? 'border-indigo-300 bg-indigo-50/60 shadow-sm shadow-indigo-100'
          : commonInterests.length > 0
          ? 'border-purple-200 bg-purple-50/30 hover:shadow-md hover:-translate-y-0.5'
          : 'border-gray-100 bg-white hover:border-indigo-200 hover:shadow-sm'
      }`}
    >
      {isMe && (
        <span className="absolute top-3 right-3 text-xs font-bold text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full">
          Вы
        </span>
      )}
      {!isMe && commonInterests.length >= 2 && (
        <span className="absolute top-3 right-3 text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
          🔥 Совпадение
        </span>
      )}

      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${
            commonInterests.length >= 2
              ? 'bg-gradient-to-br from-purple-500 to-pink-500'
              : 'bg-gradient-to-br from-indigo-500 to-purple-500'
          }`}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-gray-900 text-sm truncate">{attendee.username}</p>
          {attendee.city && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
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
            <InterestBadge
              key={i}
              interest={i}
              highlight={commonInterests.includes(i.trim())}
            />
          ))}
        </div>
      )}

      {attendee.comment && (
        <p className="text-sm text-gray-600 italic leading-snug">«{attendee.comment}»</p>
      )}

      {attendee.is_looking && !isMe && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
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

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const myUserId = typeof window !== 'undefined'
    ? (() => {
        try {
          return JSON.parse(atob(localStorage.getItem('token')?.split('.')[1] || '')).user_id;
        } catch {
          return null;
        }
      })()
    : null;

  // Load my profile to get interests for matching
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((u) => {
        if (u.interests) setMyInterests(u.interests.split(',').map((s: string) => s.trim()).filter(Boolean));
      })
      .catch(() => {});
  }, [token]);

  const fetchAttendees = useCallback(async () => {
    try {
      const url = `${API_BASE}/attendees/${eventId}${onlyLooking ? '?only_looking=true' : ''}`;
      const res = await fetch(url);
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

  useEffect(() => {
    Promise.all([fetchAttendees(), fetchMyStatus()]).finally(() => setLoading(false));
  }, [fetchAttendees, fetchMyStatus]);

  const getCommonInterests = useCallback(
    (attendee: Attendee): string[] => {
      if (!myInterests.length || !attendee.interests || attendee.user_id === myUserId) return [];
      const their = attendee.interests.split(',').map((s) => s.trim()).filter(Boolean);
      return myInterests.filter((i) => their.includes(i));
    },
    [myInterests, myUserId]
  );

  // Collect all unique interests across attendees for filter
  const allInterests = useMemo(() => {
    const set = new Set<string>();
    attendees.forEach((a) => {
      if (a.interests) a.interests.split(',').forEach((i) => set.add(i.trim()));
    });
    return Array.from(set).filter(Boolean).sort();
  }, [attendees]);

  const processedAttendees = useMemo(() => {
    let list = [...attendees];

    // Filter by interest
    if (filterInterest) {
      list = list.filter((a) =>
        a.interests?.split(',').map((s) => s.trim()).includes(filterInterest)
      );
    }

    // Sort
    if (sortBy === 'match') {
      list.sort((a, b) => {
        const scoreA = getCommonInterests(a).length;
        const scoreB = getCommonInterests(b).length;
        if (scoreB !== scoreA) return scoreB - scoreA;
        // Me always first
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

  const lookingCount = attendees.filter((a) => a.is_looking).length;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900 text-base">
            🤝 Идут на событие
            {attendees.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">{attendees.length} чел.</span>
            )}
          </h2>
          {lookingCount > 0 && (
            <p className="text-xs text-emerald-600 mt-0.5">{lookingCount} ищут компанию</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sort toggle */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden text-xs font-semibold">
            <button
              onClick={() => setSortBy('match')}
              className={`px-3 py-1.5 transition ${
                sortBy === 'match' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              🎯 По совпадению
            </button>
            <button
              onClick={() => setSortBy('date')}
              className={`px-3 py-1.5 transition ${
                sortBy === 'date' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              🕐 По дате
            </button>
          </div>

          <button
            onClick={() => setOnlyLooking((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition ${
              onlyLooking
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {onlyLooking ? '✓ Только ищут' : 'Только ищут'}
          </button>

          {!myStatus.attending ? (
            <button
              onClick={() => (token ? setShowForm((v) => !v) : (window.location.href = '/login'))}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold px-4 py-1.5 rounded-full hover:opacity-90 shadow-sm shadow-indigo-100 transition"
            >
              + Иду!
            </button>
          ) : (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="text-sm font-bold px-4 py-1.5 rounded-full border border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition"
            >
              ✏️ Изменить
            </button>
          )}
        </div>
      </div>

      {/* Interest filter chips */}
      {allInterests.length > 0 && (
        <div className="px-6 py-3 border-b border-gray-50 flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterInterest('')}
            className={`text-xs px-3 py-1 rounded-full border font-medium transition ${
              !filterInterest
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
            }`}
          >
            Все
          </button>
          {allInterests.map((int) => (
            <button
              key={int}
              onClick={() => setFilterInterest(int === filterInterest ? '' : int)}
              className={`text-xs px-3 py-1 rounded-full border font-medium transition ${
                filterInterest === int
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : myInterests.includes(int)
                  ? 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'
              }`}
            >
              {myInterests.includes(int) ? '⭐ ' : ''}{int}
            </button>
          ))}
        </div>
      )}

      {/* Join form */}
      {showForm && (
        <div className="px-6 py-4 bg-indigo-50/50 border-b border-indigo-100">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            {myStatus.attending ? 'Обновить участие' : 'Расскажи о себе другим участникам'}
          </p>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 200))}
            placeholder="Коротко о себе или пожелания для компании (необязательно)"
            rows={2}
            className="w-full text-sm border border-indigo-200 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white resize-none"
          />
          <p className="text-xs text-gray-400 mb-3 text-right">{comment.length}/200</p>
          <label className="flex items-center gap-2 cursor-pointer mb-4">
            <div
              onClick={() => setIsLooking((v) => !v)}
              className={`w-10 h-5 rounded-full transition-colors relative ${
                isLooking ? 'bg-emerald-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  isLooking ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </div>
            <span className="text-sm text-gray-700">
              {isLooking ? '🟢 Ищу компанию для похода' : '⚫ Просто отмечаюсь'}
            </span>
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleJoin}
              disabled={joining}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold py-2 rounded-xl hover:opacity-90 transition disabled:opacity-60"
            >
              {joining ? 'Сохранение...' : myStatus.attending ? 'Обновить' : 'Подтвердить участие'}
            </button>
            {myStatus.attending && (
              <button
                onClick={handleLeave}
                disabled={joining}
                className="px-4 text-sm text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition disabled:opacity-60"
              >
                Отменить
              </button>
            )}
            <button
              onClick={() => setShowForm(false)}
              className="px-4 text-sm text-gray-400 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Attendees list */}
      <div className="p-6">
        {myInterests.length > 0 && sortBy === 'match' && attendees.length > 1 && (
          <p className="text-xs text-indigo-400 mb-4 flex items-center gap-1">
            <span>🎯</span> Участники отсортированы по совпадению интересов с вашим профилем
          </p>
        )}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : processedAttendees.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-4xl mb-3">🎭</p>
            <p className="text-gray-500 font-medium">
              {filterInterest ? `Никого с интересом «${filterInterest}»` : 'Пока никто не отметился'}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {filterInterest ? 'Попробуй другой фильтр' : 'Будь первым — нажми «Иду!»'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {processedAttendees.map((a) => (
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
