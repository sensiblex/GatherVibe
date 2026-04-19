'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiFetch';
import { toast } from '../../components/Toast';
import { useAuth } from '../../context/AuthContext';

interface Appeal {
  id: number; user_id: number; username: string | null; email: string | null;
  message: string; status: string; review_reason: string | null;
  reviewed_at: string | null; created_at: string;
}

export default function AppealsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Appeal[]>([]);
  const [status, setStatus] = useState('open');
  const [reasonDraft, setReasonDraft] = useState<Record<number, string>>({});

  const load = () => {
    const qp = new URLSearchParams();
    if (status) qp.set('status', status);
    apiFetch(`/admin/appeals?${qp.toString()}`)
      .then(r => r.json()).then(setItems).catch(() => setItems([]));
  };
  useEffect(load, [status]);

  const act = async (id: number, decision: 'approve' | 'reject') => {
    const reason = reasonDraft[id] || '';
    const r = await apiFetch(`/admin/appeals/${id}/${decision}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (r.ok) { toast(decision === 'approve' ? 'Апелляция удовлетворена' : 'Апелляция отклонена', 'success'); load(); }
    else {
      const b = await r.json().catch(() => ({}));
      toast(b?.detail || 'Ошибка', 'error');
    }
  };

  const canResolve = user?.role === 'admin';

  return (
    <>
      <h1>Апелляции</h1>
      <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="appeals-status">
        <option value="open">Открытые</option>
        <option value="approved">Удовлетворённые</option>
        <option value="rejected">Отклонённые</option>
        <option value="">Все</option>
      </select>
      <div style={{ marginTop: 16 }}>
        {items.length === 0 && <p style={{ opacity: 0.6 }}>Нет апелляций</p>}
        {items.map((a) => (
          <div
            key={a.id}
            data-testid={`appeal-row-${a.id}`}
            style={{ padding: 12, border: '1px solid var(--border, #eee)', borderRadius: 10, marginBottom: 10 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <b>#{a.id} — {a.username || `user ${a.user_id}`}</b>
              <span style={{ fontSize: 12, opacity: 0.7 }}>{new Date(a.created_at).toLocaleString('ru-RU')}</span>
            </div>
            <p style={{ margin: '8px 0' }}>{a.message}</p>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Статус: {a.status}</div>
            {a.status === 'open' && canResolve && (
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <input
                  value={reasonDraft[a.id] || ''}
                  onChange={(e) => setReasonDraft({ ...reasonDraft, [a.id]: e.target.value })}
                  placeholder="Причина решения"
                  data-testid={`appeal-reason-${a.id}`}
                  style={{ flex: 1, padding: 6 }}
                />
                <button
                  className="btn btn-ink btn-sm"
                  data-testid={`appeal-approve-${a.id}`}
                  onClick={() => act(a.id, 'approve')}
                >
                  Удовлетворить
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  data-testid={`appeal-reject-${a.id}`}
                  onClick={() => act(a.id, 'reject')}
                >
                  Отклонить
                </button>
              </div>
            )}
            {a.review_reason && (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                Резолюция: {a.review_reason}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
