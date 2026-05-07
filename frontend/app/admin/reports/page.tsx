'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/apiFetch';

interface Report {
  id: number;
  reporter_id: number;
  target_type: string;
  target_id: string;
  reason: string;
  comment: string | null;
  status: string;
  resolution: string | null;
  created_at: string;
}

export default function ReportsInbox() {
  const [items, setItems] = useState<Report[]>([]);
  const [status, setStatus] = useState('open');
  const [targetType, setTargetType] = useState('');

  const load = () => {
    const qp = new URLSearchParams();
    if (status) qp.set('status', status);
    if (targetType) qp.set('target_type', targetType);
    apiFetch(`/admin/reports?${qp.toString()}`)
      .then((r) => r.json())
      .then(setItems)
      .catch(() => setItems([]));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, targetType]);

  return (
    <>
      <h1>Жалобы</h1>
      <div style={{ display: 'flex', gap: 12, margin: '12px 0' }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="filter-status">
          <option value="open">Открытые</option>
          <option value="resolved">Решённые</option>
          <option value="rejected">Отклонённые</option>
          <option value="">Все</option>
        </select>
        <select value={targetType} onChange={(e) => setTargetType(e.target.value)} data-testid="filter-target">
          <option value="">Любой тип</option>
          <option value="chat_message">Сообщение</option>
          <option value="party">Party</option>
          <option value="user">Пользователь</option>
          <option value="review">Отзыв</option>
          <option value="recap_item">Recap</option>
        </select>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left' }}>
            <th>#</th><th>Тип</th><th>Target</th><th>Причина</th><th>Статус</th><th>Когда</th><th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id} data-testid={`report-row-${r.id}`} style={{ borderTop: '1px solid var(--border, #eee)' }}>
              <td>{r.id}</td>
              <td>{r.target_type}</td>
              <td>{r.target_id}</td>
              <td>{r.reason}</td>
              <td>{r.status}</td>
              <td>{new Date(r.created_at).toLocaleString('ru-RU')}</td>
              <td>
                <Link href={`/admin/reports/${r.id}`} className="btn btn-ghost btn-xs">
                  Открыть
                </Link>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 16, opacity: 0.6 }}>Ничего не найдено</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
