'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../../lib/apiFetch';
import { toast } from '../../../components/Toast';

interface ReportDetail {
  id: number;
  reporter_id: number;
  target_type: string;
  target_id: string;
  reason: string;
  comment: string | null;
  status: string;
  resolution: string | null;
  resolution_reason: string | null;
  created_at: string;
  context: Record<string, unknown>;
}

const RESOLUTIONS = [
  { value: 'warn', label: 'Предупреждение автору' },
  { value: 'hide', label: 'Скрыть контент' },
  { value: 'delete', label: 'Удалить' },
  { value: 'ban', label: 'Забанить (24 ч)' },
  { value: 'none', label: 'Без действия' },
];

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<ReportDetail | null>(null);
  const [resolution, setResolution] = useState('hide');
  const [reason, setReason] = useState('');

  useEffect(() => {
    apiFetch(`/admin/reports/${id}`).then((r) => r.json()).then(setData);
  }, [id]);

  if (!data) return <p>Загрузка…</p>;

  const act = async (mode: 'resolve' | 'reject') => {
    const body =
      mode === 'resolve'
        ? { resolution, reason, ban_duration_hours: resolution === 'ban' ? 24 : null }
        : { reason };
    const r = await apiFetch(`/admin/reports/${id}/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      toast(mode === 'resolve' ? 'Жалоба обработана' : 'Жалоба отклонена', 'success');
      router.push('/admin/reports');
    } else {
      const b = await r.json().catch(() => ({}));
      toast(b?.detail || 'Ошибка', 'error');
    }
  };

  return (
    <>
      <h1>Жалоба #{data.id}</h1>
      <p><b>Тип:</b> {data.target_type} · <b>ID:</b> {data.target_id}</p>
      <p><b>Причина:</b> {data.reason}</p>
      {data.comment && <p><b>Комментарий:</b> {data.comment}</p>}
      <p><b>Статус:</b> {data.status}</p>

      <h3>Контекст</h3>
      <pre data-testid="report-context" style={{
        background: 'var(--card-alt, #f5f5f7)', padding: 12, borderRadius: 8, overflow: 'auto',
      }}>
        {JSON.stringify(data.context, null, 2)}
      </pre>

      {data.status === 'open' && (
        <>
          <h3>Действие</h3>
          <select value={resolution} onChange={(e) => setResolution(e.target.value)} data-testid="resolution-select">
            {RESOLUTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Причина действия"
            data-testid="resolution-reason"
            rows={2}
            style={{ display: 'block', width: '100%', marginTop: 8, padding: 8 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-ink btn-sm" data-testid="btn-resolve" onClick={() => act('resolve')}>
              Применить
            </button>
            <button className="btn btn-ghost btn-sm" data-testid="btn-reject" onClick={() => act('reject')}>
              Отклонить жалобу
            </button>
          </div>
        </>
      )}
    </>
  );
}
