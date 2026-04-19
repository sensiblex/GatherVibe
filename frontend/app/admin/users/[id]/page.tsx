'use client';

import { use, useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/apiFetch';
import { toast } from '../../../components/Toast';
import { useAuth } from '../../../context/AuthContext';

interface UserDetail {
  id: number; username: string; email: string; bio: string | null;
  role: string; is_banned: boolean; banned_until: string | null; ban_reason: string | null;
  muted_until: string | null; warnings_count: number; trust_score: number | null;
  avatar_url: string | null;
  reports_against: { id: number; reporter_id: number; reason: string; status: string; created_at: string }[];
}

export default function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user: me } = useAuth();
  const [data, setData] = useState<UserDetail | null>(null);
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState('24');

  const reload = () => {
    apiFetch(`/admin/users/${id}`).then((r) => r.json()).then(setData).catch(() => {});
  };
  useEffect(reload, [id]);

  if (!data) return <p>Загрузка…</p>;

  const post = async (path: string, body: unknown = {}) => {
    const r = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      toast('Готово', 'success');
      reload();
    } else {
      toast((j as { detail?: string })?.detail || 'Ошибка', 'error');
    }
  };

  const hrs = Number(duration) || null;
  const canAdminOps = me?.role === 'admin';

  return (
    <>
      <h1>{data.username}</h1>
      <p><b>Email:</b> {data.email}</p>
      <p><b>Роль:</b> {data.role}</p>
      <p><b>Бан:</b> {data.is_banned ? `да${data.banned_until ? ` (до ${new Date(data.banned_until).toLocaleString('ru-RU')})` : ' (перм.)'}` : 'нет'}</p>
      {data.muted_until && <p><b>Мут до:</b> {new Date(data.muted_until).toLocaleString('ru-RU')}</p>}
      <p><b>Предупреждений:</b> {data.warnings_count}</p>
      {data.ban_reason && <p><b>Причина бана:</b> {data.ban_reason}</p>}

      <h3>Действия</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Причина"
          data-testid="action-reason"
          style={{ padding: 8, minWidth: 220 }}
        />
        <input
          value={duration} onChange={(e) => setDuration(e.target.value)}
          placeholder="Часы"
          data-testid="action-duration"
          style={{ padding: 8, width: 80 }}
        />
        <button className="btn btn-ghost btn-sm" data-testid="btn-warn"
                onClick={() => post(`/admin/users/${id}/warn`, { reason })}>
          Warn
        </button>
        <button className="btn btn-ghost btn-sm" data-testid="btn-mute"
                onClick={() => post(`/admin/users/${id}/mute`, { duration_hours: hrs, reason })}>
          Mute
        </button>
        <button className="btn btn-ghost btn-sm" data-testid="btn-ban"
                onClick={() => post(`/admin/users/${id}/ban`, { duration_hours: hrs, reason })}>
          Ban ({duration}ч)
        </button>
        {canAdminOps && (
          <button className="btn btn-ghost btn-sm" data-testid="btn-ban-perm"
                  onClick={() => post(`/admin/users/${id}/ban`, { duration_hours: null, reason })}>
            Ban permanent
          </button>
        )}
        <button className="btn btn-ghost btn-sm" data-testid="btn-unban"
                onClick={() => post(`/admin/users/${id}/unban`)}>
          Unban
        </button>
        <button className="btn btn-ghost btn-sm" data-testid="btn-unmute"
                onClick={() => post(`/admin/users/${id}/unmute`)}>
          Unmute
        </button>
        {canAdminOps && (
          <>
            <button className="btn btn-ghost btn-sm" data-testid="btn-role-mod"
                    onClick={() => post(`/admin/users/${id}/role`, { role: 'moderator' })}>
              → moderator
            </button>
            <button className="btn btn-ghost btn-sm" data-testid="btn-role-user"
                    onClick={() => post(`/admin/users/${id}/role`, { role: 'user' })}>
              → user
            </button>
            <button
              className="btn btn-ghost btn-sm"
              data-testid="btn-delete-user"
              style={{ color: '#b91c1c' }}
              onClick={async () => {
                if (!confirm(`Удалить пользователя ${data.username}? Это действие необратимо.`)) return;
                const r = await apiFetch(`/admin/users/${id}`, { method: 'DELETE' });
                if (r.ok) { toast('Пользователь удалён', 'success'); window.location.href = '/admin/users'; }
                else {
                  const b = await r.json().catch(() => ({}));
                  toast((b as { detail?: string })?.detail || 'Ошибка', 'error');
                }
              }}
            >
              Удалить
            </button>
          </>
        )}
      </div>

      <h3 style={{ marginTop: 24 }}>Жалобы на пользователя</h3>
      {data.reports_against.length === 0 && <p>Нет</p>}
      {data.reports_against.length > 0 && (
        <ul>
          {data.reports_against.map((r) => (
            <li key={r.id}>#{r.id} — {r.reason} — {r.status}</li>
          ))}
        </ul>
      )}
    </>
  );
}
