'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiFetch';

interface AuditEntry {
  id: number;
  actor_id: number | null;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  extra: unknown;
  created_at: string;
}

export default function AuditPage() {
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/admin/audit')
      .then(async (r) => {
        if (r.status === 403) { setErr('Только admin имеет доступ к аудиту.'); return []; }
        return r.json();
      })
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  if (err) return <p style={{ color: 'tomato' }}>{err}</p>;

  return (
    <>
      <h1>Аудит</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th>#</th><th>Actor</th><th>Role</th><th>Action</th><th>Target</th><th>Extra</th><th>Время</th>
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.id} data-testid={`audit-row-${e.id}`} style={{ borderTop: '1px solid var(--border, #eee)' }}>
              <td>{e.id}</td>
              <td>{e.actor_id}</td>
              <td>{e.actor_role}</td>
              <td>{e.action}</td>
              <td>{e.target_type}:{e.target_id}</td>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {e.extra ? JSON.stringify(e.extra) : '—'}
              </td>
              <td>{new Date(e.created_at).toLocaleString('ru-RU')}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 16, opacity: 0.6 }}>Пусто</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
