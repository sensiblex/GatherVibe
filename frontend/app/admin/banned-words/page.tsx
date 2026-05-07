'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiFetch';
import { toast } from '../../components/Toast';

interface BannedWord { id: number; pattern: string; is_regex: boolean; created_at: string | null; }

export default function BannedWordsPage() {
  const [items, setItems] = useState<BannedWord[]>([]);
  const [pattern, setPattern] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    apiFetch('/admin/banned-words')
      .then(async (r) => {
        if (r.status === 403) { setErr('Только admin имеет доступ к словарю.'); return []; }
        return r.json();
      })
      .then(setItems)
      .catch(() => setItems([]));
  };
  useEffect(load, []);

  const add = async () => {
    const p = pattern.trim();
    if (!p) return;
    const r = await apiFetch('/admin/banned-words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: p, is_regex: isRegex }),
    });
    if (r.ok) {
      toast('Добавлено', 'success');
      setPattern(''); setIsRegex(false);
      load();
    } else {
      const b = await r.json().catch(() => ({}));
      toast(b?.detail || 'Ошибка', 'error');
    }
  };

  const del = async (id: number) => {
    const r = await apiFetch(`/admin/banned-words/${id}`, { method: 'DELETE' });
    if (r.status === 204) { toast('Удалено', 'success'); load(); }
    else toast('Ошибка', 'error');
  };

  if (err) return <p style={{ color: 'tomato' }}>{err}</p>;

  return (
    <>
      <h1>Запрещённые слова</h1>
      <div style={{ display: 'flex', gap: 8, margin: '12px 0', alignItems: 'center' }}>
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="слово или regex"
          data-testid="bw-pattern"
          style={{ flex: 1, padding: 8, minWidth: 240 }}
        />
        <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={isRegex}
            onChange={(e) => setIsRegex(e.target.checked)}
            data-testid="bw-is-regex"
          />
          regex
        </label>
        <button className="btn btn-ink btn-sm" data-testid="bw-add" onClick={add}>
          Добавить
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th>#</th><th>Pattern</th><th>Regex</th><th>Создано</th><th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((w) => (
            <tr key={w.id} data-testid={`bw-row-${w.id}`} style={{ borderTop: '1px solid var(--border, #eee)' }}>
              <td>{w.id}</td>
              <td style={{ fontFamily: 'monospace' }}>{w.pattern}</td>
              <td>{w.is_regex ? 'да' : 'нет'}</td>
              <td>{w.created_at ? new Date(w.created_at).toLocaleString('ru-RU') : '—'}</td>
              <td>
                <button className="btn btn-ghost btn-xs" data-testid={`bw-del-${w.id}`} onClick={() => del(w.id)}>
                  Удалить
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 16, opacity: 0.6 }}>Словарь пуст</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
