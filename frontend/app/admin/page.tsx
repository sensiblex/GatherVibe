'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiFetch';

interface Overview {
  total_users: number;
  banned_users: number;
  open_reports: number;
  total_parties: number;
  hidden_parties: number;
  mod_actions_24h: number;
}

interface Bucket { date: string; count: number }
interface TimeSeries { new_users: Bucket[]; new_reports: Bucket[]; mod_actions: Bucket[] }

function SparklineBar({ data, color, label }: { data: Bucket[]; color: string; label: string }) {
  const max = Math.max(1, ...data.map((b) => b.count));
  return (
    <div style={{ padding: 12, border: '1px solid var(--border, #eee)', borderRadius: 10, minWidth: 240 }}>
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>{label} (7д)</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 56 }}>
        {data.map((b) => (
          <div key={b.date} title={`${b.date}: ${b.count}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <div
              style={{
                width: '100%',
                height: Math.max(2, Math.round((b.count / max) * 48)),
                background: color,
                borderRadius: 3,
              }}
            />
            <span style={{ fontSize: 9, opacity: 0.6 }}>{b.date.slice(-2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [ts, setTs] = useState<TimeSeries | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/admin/metrics/overview')
      .then(async (r) => {
        if (r.status === 403) { setErr('Только admin имеет доступ к метрикам.'); return null; }
        if (!r.ok) throw new Error('Ошибка загрузки');
        return r.json();
      })
      .then((d) => d && setData(d))
      .catch((e) => setErr(String(e)));
    apiFetch('/admin/metrics/timeseries?days=7')
      .then((r) => r.ok ? r.json() : null)
      .then(setTs)
      .catch(() => {});
  }, []);

  if (err) return <p style={{ color: 'tomato' }}>{err}</p>;
  if (!data) return <p>Загрузка…</p>;

  const card = (label: string, value: number | string, testId: string) => (
    <div
      data-testid={testId}
      style={{
        padding: 16, border: '1px solid var(--border, #eee)', borderRadius: 10,
        minWidth: 140,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );

  return (
    <>
      <h1>Обзор</h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
        {card('Пользователи', data.total_users, 'metric-total-users')}
        {card('Забанено', data.banned_users, 'metric-banned')}
        {card('Открытых жалоб', data.open_reports, 'metric-open-reports')}
        {card('Party всего', data.total_parties, 'metric-total-parties')}
        {card('Скрыто party', data.hidden_parties, 'metric-hidden-parties')}
        {card('Действий /24ч', data.mod_actions_24h, 'metric-actions-24h')}
      </div>
      {ts && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 24 }} data-testid="charts">
          <SparklineBar data={ts.new_users} color="#610bef" label="Новые регистрации" />
          <SparklineBar data={ts.new_reports} color="#ef4444" label="Жалобы" />
          <SparklineBar data={ts.mod_actions} color="#059669" label="Действия модераторов" />
        </div>
      )}
    </>
  );
}
