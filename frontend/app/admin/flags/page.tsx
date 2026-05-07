'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiFetch';
import { toast } from '../../components/Toast';

interface Flag {
  key: string;
  enabled: boolean;
  description: string | null;
  updated_at: string | null;
}

export default function FlagsPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    apiFetch('/admin/flags')
      .then(async (r) => {
        if (r.status === 403) { setErr('Только admin имеет доступ к флагам.'); return []; }
        return r.json();
      })
      .then(setFlags)
      .catch(() => setFlags([]));
  };

  useEffect(load, []);

  const toggle = async (key: string, enabled: boolean) => {
    const r = await apiFetch(`/admin/flags/${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (r.ok) { toast('Сохранено', 'success'); load(); }
    else toast('Ошибка', 'error');
  };

  if (err) return <p style={{ color: 'tomato' }}>{err}</p>;

  return (
    <>
      <h1>Feature flags</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th>Key</th><th>Описание</th><th>Статус</th><th>Обновлено</th><th></th>
          </tr>
        </thead>
        <tbody>
          {flags.map((f) => (
            <tr key={f.key} data-testid={`flag-row-${f.key}`} style={{ borderTop: '1px solid var(--border, #eee)' }}>
              <td style={{ fontFamily: 'monospace' }}>{f.key}</td>
              <td>{f.description}</td>
              <td>
                <span
                  data-testid={`flag-status-${f.key}`}
                  style={{
                    padding: '2px 8px', borderRadius: 10, fontSize: 12,
                    background: f.enabled ? '#d1fae5' : '#fee2e2',
                    color: f.enabled ? '#065f46' : '#991b1b',
                  }}
                >
                  {f.enabled ? 'включён' : 'выключен'}
                </span>
              </td>
              <td>{f.updated_at ? new Date(f.updated_at).toLocaleString('ru-RU') : '—'}</td>
              <td>
                <button
                  className="btn btn-ghost btn-xs"
                  data-testid={`flag-toggle-${f.key}`}
                  onClick={() => toggle(f.key, !f.enabled)}
                >
                  {f.enabled ? 'Выключить' : 'Включить'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
