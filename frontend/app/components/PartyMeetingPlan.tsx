'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Socket } from 'socket.io-client';
import { apiFetch } from '../lib/apiFetch';
import { toast } from './Toast';
import { resolveApiBase } from '../lib/apiBase';

const PartyMeetingMap = dynamic(() => import('./PartyMeetingMap'), { ssr: false });

const API_BASE = resolveApiBase();

interface MeetingPlan {
  meet_time: string | null;
  meet_location: string | null;
  note: string | null;
  meet_lat: number | null;
  meet_lon: number | null;
  meet_landmark: string | null;
  updated_by_username: string | null;
  updated_at: string | null;
}

interface HistoryItem {
  meet_time: string | null;
  meet_location: string | null;
  note: string | null;
  meet_lat: number | null;
  meet_lon: number | null;
  meet_landmark: string | null;
  changed_by_username: string;
  changed_at: string;
}

interface PlanUpdatedPayload {
  party_id: number;
  meet_time: string | null;
  meet_location: string | null;
  note: string | null;
  meet_lat: number | null;
  meet_lon: number | null;
  meet_landmark: string | null;
  updated_by: string;
  updated_at: string;
}

interface PartyMeetingPlanProps {
  partyId: number;
  isCreator: boolean;
  socket: Socket | null;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'не указано';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export default function PartyMeetingPlan({ partyId, isCreator, socket }: PartyMeetingPlanProps) {
  const [plan, setPlan] = useState<MeetingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [form, setForm] = useState({
    meet_time: '',
    meet_location: '',
    note: '',
  });

  useEffect(() => {
    apiFetch(`${API_BASE}/parties/${partyId}/plan`)
      .then(async (res) => {
        if (res.status === 404) {
          setPlan(null);
        } else if (res.ok) {
          const data: MeetingPlan = await res.json();
          setPlan(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [partyId]);

  useEffect(() => {
    if (!socket) return;

    const onPlanUpdated = (payload: PlanUpdatedPayload) => {
      if (payload.party_id !== partyId) return;
      setPlan({
        meet_time: payload.meet_time,
        meet_location: payload.meet_location,
        note: payload.note,
        meet_lat: payload.meet_lat,
        meet_lon: payload.meet_lon,
        meet_landmark: payload.meet_landmark,
        updated_by_username: payload.updated_by,
        updated_at: payload.updated_at,
      });
    };

    socket.on('plan_updated', onPlanUpdated);
    return () => { socket.off('plan_updated', onPlanUpdated); };
  }, [socket, partyId]);

  const startEdit = () => {
    setForm({
      meet_time: isoToDatetimeLocal(plan?.meet_time ?? null),
      meet_location: plan?.meet_location ?? '',
      note: plan?.note ?? '',
    });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/parties/${partyId}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meet_time: datetimeLocalToIso(form.meet_time),
          meet_location: form.meet_location.trim() || null,
          note: form.note.trim() || null,
          // preserve existing map coords
          meet_lat: plan?.meet_lat ?? null,
          meet_lon: plan?.meet_lon ?? null,
          meet_landmark: plan?.meet_landmark ?? null,
        }),
      });
      if (res.ok) {
        const data: MeetingPlan = await res.json();
        setPlan(data);
        setEditing(false);
        toast('План встречи сохранён', 'success');
      } else {
        const d = await res.json();
        toast(d?.detail ?? 'Ошибка сохранения', 'error');
      }
    } catch {
      toast('Ошибка сети', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleMapSave = async (lat: number, lon: number, landmark: string) => {
    try {
      const res = await apiFetch(`${API_BASE}/parties/${partyId}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meet_time: plan?.meet_time ?? null,
          meet_location: plan?.meet_location ?? null,
          note: plan?.note ?? null,
          meet_lat: lat,
          meet_lon: lon,
          meet_landmark: landmark || null,
        }),
      });
      if (res.ok) {
        const data: MeetingPlan = await res.json();
        setPlan(data);
        toast('Точка встречи сохранена', 'success');
      } else {
        const d = await res.json();
        toast(d?.detail ?? 'Ошибка сохранения', 'error');
        throw new Error(d?.detail ?? 'save failed');
      }
    } catch (err) {
      if (err instanceof Error && err.message !== 'save failed') {
        toast('Ошибка сети', 'error');
      }
      throw err;
    }
  };

  const toggleHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    setShowHistory(true);
    try {
      const res = await apiFetch(`${API_BASE}/parties/${partyId}/plan/history`);
      if (res.ok) {
        const data: HistoryItem[] = await res.json();
        setHistory(data.slice(0, 5));
      }
    } catch {}
    setHistoryLoading(false);
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-sm)',
  };

  if (loading) {
    return (
      <div className="rounded-2xl p-5 animate-pulse" style={cardStyle}>
        <div className="h-4 rounded w-1/3 mb-3" style={{ background: 'var(--surface-2)' }} />
        <div className="h-3 rounded w-2/3 mb-2" style={{ background: 'var(--surface-2)' }} />
        <div className="h-3 rounded w-1/2" style={{ background: 'var(--surface-2)' }} />
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={cardStyle}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          План встречи
        </h3>
        {isCreator && !editing && (
          <button
            onClick={startEdit}
            className="text-xs px-3 py-1.5 rounded-xl font-medium transition hover:opacity-80"
            style={{
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              background: 'var(--surface-2)',
            }}
          >
            {plan ? 'Изменить план' : '+ Задать план'}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 flex flex-col gap-3">
        {/* Plan display */}
        {!plan && !editing && (
          <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
            План встречи ещё не задан
          </p>
        )}

        {plan && !editing && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start gap-2 text-sm">
              <span className="shrink-0 font-semibold" style={{ color: 'var(--primary)' }}>Время:</span>
              <span style={{ color: 'var(--text-muted)' }}>
                Время встречи:{' '}
                <span className="font-semibold" style={{ color: 'var(--text)' }}>
                  {formatDateTime(plan.meet_time)}
                </span>
              </span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <span className="shrink-0 font-semibold" style={{ color: 'var(--primary)' }}>Место:</span>
              <span style={{ color: 'var(--text-muted)' }}>
                Место встречи:{' '}
                <span className="font-semibold" style={{ color: 'var(--text)' }}>
                  {plan.meet_location || 'не указано'}
                </span>
              </span>
            </div>
            {plan.note && (
              <div className="flex items-start gap-2 text-sm">
                <span className="shrink-0 font-semibold" style={{ color: 'var(--primary)' }}>Заметка:</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  Заметка:{' '}
                  <span style={{ color: 'var(--text)' }}>{plan.note}</span>
                </span>
              </div>
            )}
            {plan.updated_by_username && plan.updated_at && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
                Обновлено:{' '}
                <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>
                  {plan.updated_by_username}
                </span>
                {' · '}
                {formatDate(plan.updated_at)}
              </p>
            )}
          </div>
        )}

        {/* Inline edit form */}
        {editing && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Время встречи
              </label>
              <input
                type="datetime-local"
                className="gv-input"
                value={form.meet_time}
                onChange={e => setForm(f => ({ ...f, meet_time: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Место встречи
              </label>
              <input
                className="gv-input"
                maxLength={300}
                placeholder="Например: Площадь у фонтана"
                value={form.meet_location}
                onChange={e => setForm(f => ({ ...f, meet_location: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                Заметка
              </label>
              <textarea
                className="gv-input resize-none"
                rows={3}
                maxLength={300}
                placeholder="Дополнительная информация..."
                value={form.note}
                onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="gv-btn-primary text-sm px-4 py-2 rounded-xl disabled:opacity-50"
              >
                {saving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="text-sm px-4 py-2 rounded-xl font-medium transition disabled:opacity-50 hover:opacity-80"
                style={{
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                  background: 'var(--surface-2)',
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {/* Meeting point map */}
        {!editing && (plan || isCreator) && (
          <div
            className="rounded-xl p-3 flex flex-col gap-2"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          >
            <p className="text-xs font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
              <span className="gv-map-dot" aria-hidden="true" />
              Точка встречи
            </p>
            <PartyMeetingMap
              partyId={partyId}
              isCreator={isCreator}
              lat={plan?.meet_lat ?? null}
              lon={plan?.meet_lon ?? null}
              landmark={plan?.meet_landmark ?? null}
              onSave={handleMapSave}
            />
          </div>
        )}

        {/* History toggle */}
        {(plan || history.length > 0) && !editing && (
          <div className="mt-1">
            <button
              onClick={toggleHistory}
              className="text-xs font-medium transition hover:opacity-70"
              style={{ color: 'var(--text-faint)' }}
            >
              {showHistory ? '▲ Скрыть историю' : '▼ История изменений'}
            </button>

            {showHistory && (
              <div className="mt-2 flex flex-col gap-2">
                {historyLoading && (
                  <div className="animate-pulse">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-3 rounded mb-1.5" style={{ background: 'var(--surface-2)' }} />
                    ))}
                  </div>
                )}
                {!historyLoading && history.length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--text-faint)' }}>История пуста</p>
                )}
                {!historyLoading && history.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl px-3 py-2.5 flex flex-col gap-0.5"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {item.meet_time !== undefined && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {formatDateTime(item.meet_time)}
                        </span>
                      )}
                      {item.meet_location !== undefined && item.meet_location && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {item.meet_location}
                        </span>
                      )}
                      {item.note && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {item.note}
                        </span>
                      )}
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                      <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>
                        {item.changed_by_username}
                      </span>
                      {' · '}
                      {formatDate(item.changed_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

