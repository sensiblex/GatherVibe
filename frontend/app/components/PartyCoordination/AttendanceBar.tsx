'use client';

import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { apiFetch } from '../../lib/apiFetch';
import { toast } from '../Toast';
import { resolveApiBase } from '../../lib/apiBase';

const API_BASE = resolveApiBase();

interface AttendanceRecord {
  user_id: number;
  username: string;
  status: 'going' | 'late' | 'cant';
  updated_at: string;
}

interface AttendanceChangedPayload {
  userId: number;
  username: string;
  status: 'going' | 'late' | 'cant' | null;
  partyId: number;
}

interface PartyMember {
  user_id: number;
  username: string;
  status: string;
}

interface AttendanceBarProps {
  partyId: number;
  partyMembers: PartyMember[];
  creatorId: number;
  creatorUsername: string;
  currentUserId: number | null;
  socket: Socket | null;
}

type AttendanceStatus = 'going' | 'late' | 'cant';

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  going: 'Идут',
  late: 'Опаздывают',
  cant: 'Не придут',
};

const STATUS_ICONS: Record<AttendanceStatus, string> = {
  going: '',
  late: '',
  cant: '',
};

const STATUS_COLORS: Record<AttendanceStatus, { bg: string; border: string; text: string }> = {
  going:  { bg: 'var(--success-hl)',  border: 'color-mix(in oklch, var(--success) 30%, transparent)',  text: 'var(--success)' },
  late:   { bg: 'var(--warning-hl)', border: 'color-mix(in oklch, var(--warning) 30%, transparent)', text: 'var(--warning)' },
  cant:   { bg: 'var(--error-hl)',   border: 'color-mix(in oklch, var(--error) 30%, transparent)',   text: 'var(--error)' },
};

function InitialAvatar({ username, highlight }: { username: string; highlight?: boolean }) {
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ring-2 ring-offset-1"
      style={{
        background: 'linear-gradient(135deg,#4f46e5,#9333ea)',
        outline: highlight ? '2px solid var(--primary)' : 'none',
        outlineOffset: '2px',
      }}
      title={username}
    >
      {username.slice(0, 1).toUpperCase()}
    </div>
  );
}

function StatusGroup({
  status,
  records,
  currentUserId,
}: {
  status: AttendanceStatus;
  records: AttendanceRecord[];
  currentUserId: number | null;
}) {
  const colors = STATUS_COLORS[status];
  if (records.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.text }}>
        {STATUS_ICONS[status]} {STATUS_LABELS[status]} ({records.length})
      </span>
      <div className="flex flex-wrap gap-1">
        {records.map((r) => (
          <InitialAvatar
            key={r.user_id}
            username={r.username}
            highlight={r.user_id === currentUserId}
          />
        ))}
      </div>
    </div>
  );
}

export default function AttendanceBar({
  partyId,
  currentUserId,
  socket,
}: AttendanceBarProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    apiFetch(`${API_BASE}/parties/${partyId}/attendance`)
      .then(async (res) => {
        if (res.ok) {
          const data: AttendanceRecord[] = await res.json();
          setRecords(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [partyId]);

  useEffect(() => {
    if (!socket) return;

    const onAttendanceChanged = (payload: AttendanceChangedPayload) => {
      if (payload.partyId !== partyId) return;

      setRecords((prev) => {
        const filtered = prev.filter((r) => r.user_id !== payload.userId);
        if (payload.status === null) return filtered;
        return [
          ...filtered,
          {
            user_id: payload.userId,
            username: payload.username,
            status: payload.status,
            updated_at: new Date().toISOString(),
          },
        ];
      });
    };

    socket.on('attendance_changed', onAttendanceChanged);

    return () => {
      socket.off('attendance_changed', onAttendanceChanged);
    };
  }, [socket, partyId]);

  const myRecord = currentUserId !== null
    ? records.find((r) => r.user_id === currentUserId)
    : undefined;
  const myStatus = myRecord?.status ?? null;
  const isCooldownActive = cooldownSeconds > 0;

  const handleStatusClick = async (status: AttendanceStatus) => {
    if (!currentUserId || updating || isCooldownActive) return;

    const newStatus: AttendanceStatus | null = myStatus === status ? null : status;
    setUpdating(true);
    try {
      const res = await apiFetch(`${API_BASE}/parties/${partyId}/attendance/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const d = await res.json();
        if (res.status === 429) {
          const detail = typeof d?.detail === 'string' ? d.detail : '';
          const match = detail.match(/(\d+)/);
          const seconds = match ? Number(match[1]) : 60;
          setCooldownSeconds(Number.isFinite(seconds) && seconds > 0 ? seconds : 60);
        }
        toast(d?.detail ?? 'Ошибка обновления', 'error');
        return;
      }
      setCooldownSeconds(60);
      // State will be updated via socket event; optimistically update as well
      setRecords((prev) => {
        const filtered = prev.filter((r) => r.user_id !== currentUserId);
        if (newStatus === null) return filtered;
        const username = prev.find((r) => r.user_id === currentUserId)?.username ?? String(currentUserId);
        return [
          ...filtered,
          {
            user_id: currentUserId,
            username,
            status: newStatus,
            updated_at: new Date().toISOString(),
          },
        ];
      });
    } catch {
      toast('Ошибка сети', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const goingRecords = records.filter((r) => r.status === 'going');
  const lateRecords = records.filter((r) => r.status === 'late');
  const cantRecords = records.filter((r) => r.status === 'cant');

  const hasAny = records.length > 0;

  if (loading) {
    return (
      <div
        className="rounded-xl px-4 py-3 animate-pulse"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="h-4 w-32 rounded" style={{ background: 'var(--surface-2)' }} />
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Title */}
      <div
        className="px-4 py-2.5 flex items-center gap-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="text-base font-semibold" style={{ color: 'var(--primary)' }}>Посещаемость</span>
        {hasAny && (
          <span className="text-xs ml-auto" style={{ color: 'var(--text-faint)' }}>
            {records.length} ответ{records.length === 1 ? '' : records.length < 5 ? 'а' : 'ов'}
          </span>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Groups */}
        {hasAny ? (
          <div className="flex flex-wrap gap-4">
            <StatusGroup status="going" records={goingRecords} currentUserId={currentUserId} />
            <StatusGroup status="late" records={lateRecords} currentUserId={currentUserId} />
            <StatusGroup status="cant" records={cantRecords} currentUserId={currentUserId} />
          </div>
        ) : (
          <p className="text-xs text-center py-1" style={{ color: 'var(--text-faint)' }}>
            Никто ещё не отметился
          </p>
        )}

        {/* Quick-action buttons */}
        {currentUserId !== null && (
          <div className="flex flex-wrap gap-2 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
            {(['going', 'late', 'cant'] as AttendanceStatus[]).map((s) => {
              const isActive = myStatus === s;
              const colors = STATUS_COLORS[s];
              return (
                <button
                  key={s}
                  onClick={() => handleStatusClick(s)}
                  disabled={updating || isCooldownActive}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50 hover:opacity-80"
                  style={
                    isActive
                      ? {
                          background: colors.bg,
                          color: colors.text,
                          border: `1px solid ${colors.border}`,
                          fontWeight: 700,
                        }
                      : {
                          background: 'var(--surface-2)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border)',
                        }
                  }
                  aria-pressed={isActive}
                >
                  <span>{STATUS_ICONS[s]}</span>
                  <span>
                    {s === 'going' ? 'Иду' : s === 'late' ? 'Опоздаю' : 'Не смогу'}
                  </span>
                </button>
              );
            })}
            {isCooldownActive && (
              <span className="text-xs self-center" style={{ color: 'var(--text-faint)' }}>
                Обновить статус можно через {cooldownSeconds} сек.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

