'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiFetch';
import { toast } from '../../components/Toast';

interface AdminUserRow {
  id: number;
  username: string;
  email: string;
  role: string;
  is_banned: boolean;
  banned_until: string | null;
  warnings_count: number;
  trust_score: number | null;
}

export default function AdminUsersList() {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkAction, setBulkAction] = useState('warn');
  const [bulkDuration, setBulkDuration] = useState('24');
  const [bulkReason, setBulkReason] = useState('');

  const load = () => {
    const qp = new URLSearchParams();
    if (q) qp.set('q', q);
    if (role) qp.set('role', role);
    apiFetch(`/admin/users?${qp.toString()}`)
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const applyBulk = async () => {
    if (selected.size === 0) { toast('Выберите пользователей', 'error'); return; }
    const body: Record<string, unknown> = {
      user_ids: Array.from(selected),
      action: bulkAction,
      reason: bulkReason.trim() || null,
    };
    if (bulkAction === 'mute' || bulkAction === 'ban') {
      body.duration_hours = Number(bulkDuration) || null;
    }
    const r = await apiFetch('/admin/users/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      toast(`Применено: ${j.succeeded}, пропущено: ${j.skipped}`, 'success');
      setSelected(new Set());
      load();
    } else {
      toast((j as { detail?: string })?.detail || 'Ошибка', 'error');
    }
  };

  return (
    <>
      <h1>Пользователи</h1>
      <form
        onSubmit={(e) => { e.preventDefault(); load(); }}
        style={{ display: 'flex', gap: 8, margin: '12px 0' }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по email/username"
          data-testid="users-q"
          style={{ flex: 1, padding: 8 }}
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} data-testid="users-role">
          <option value="">Все роли</option>
          <option value="user">user</option>
          <option value="moderator">moderator</option>
          <option value="admin">admin</option>
        </select>
        <button className="btn btn-ink btn-sm">Найти</button>
      </form>

      {selected.size > 0 && (
        <div
          data-testid="bulk-panel"
          style={{
            padding: 12, marginBottom: 12, border: '1px solid var(--border, #eee)',
            borderRadius: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          }}
        >
          <b>Выбрано: {selected.size}</b>
          <select value={bulkAction} onChange={(e) => setBulkAction(e.target.value)} data-testid="bulk-action">
            <option value="warn">Предупреждение</option>
            <option value="mute">Mute</option>
            <option value="ban">Ban</option>
          </select>
          {(bulkAction === 'mute' || bulkAction === 'ban') && (
            <input
              value={bulkDuration}
              onChange={(e) => setBulkDuration(e.target.value)}
              placeholder="Часы"
              data-testid="bulk-duration"
              style={{ width: 80, padding: 6 }}
            />
          )}
          <input
            value={bulkReason}
            onChange={(e) => setBulkReason(e.target.value)}
            placeholder="Причина"
            data-testid="bulk-reason"
            style={{ flex: 1, padding: 6, minWidth: 200 }}
          />
          <button className="btn btn-ink btn-sm" data-testid="bulk-apply" onClick={applyBulk}>
            Применить
          </button>
          <button className="btn btn-ghost btn-xs" onClick={() => setSelected(new Set())}>
            Сбросить
          </button>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th></th>
            <th>#</th><th>Username</th><th>Email</th><th>Role</th><th>Banned</th><th>Warnings</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} data-testid={`user-row-${u.id}`} style={{ borderTop: '1px solid var(--border, #eee)' }}>
              <td>
                <input
                  type="checkbox"
                  data-testid={`user-select-${u.id}`}
                  checked={selected.has(u.id)}
                  onChange={() => toggle(u.id)}
                />
              </td>
              <td>{u.id}</td>
              <td>{u.username}</td>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{u.is_banned ? 'yes' : 'no'}</td>
              <td>{u.warnings_count}</td>
              <td>
                <Link href={`/admin/users/${u.id}`} className="btn btn-ghost btn-xs">Открыть</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
