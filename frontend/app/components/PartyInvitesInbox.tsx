'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import {
  type PartyInvite,
  getMyInvites,
  acceptInvite,
  declineInvite,
} from '../lib/partyInviteApi';

function formatEventDate(ts: number | null): string {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PartyInvitesInbox() {
  const router = useRouter();
  const [invites, setInvites] = useState<PartyInvite[] | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMyInvites()
      .then((data) => {
        if (!cancelled) setInvites(data);
      })
      .catch(() => {
        if (!cancelled) setInvites([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAccept(inv: PartyInvite) {
    setActingId(inv.id);
    try {
      const res = await acceptInvite(inv.party_id, inv.id);
      if (res.ok) {
        setInvites((prev) => (prev ?? []).filter((i) => i.id !== inv.id));
        window.dispatchEvent(new Event('party-invites:changed'));
        toast('Вы присоединились к компании', 'success', {
          label: 'Открыть',
          onClick: () => router.push(`/parties/${inv.party_id}`),
        });
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.detail || 'Не удалось принять приглашение', 'error');
      }
    } catch {
      toast('Ошибка сети', 'error');
    } finally {
      setActingId(null);
    }
  }

  async function handleDecline(inv: PartyInvite) {
    setActingId(inv.id);
    try {
      const res = await declineInvite(inv.party_id, inv.id);
      if (res.ok) {
        setInvites((prev) => (prev ?? []).filter((i) => i.id !== inv.id));
        window.dispatchEvent(new Event('party-invites:changed'));
        toast('Приглашение отклонено', 'info');
      } else {
        toast('Не удалось отклонить приглашение', 'error');
      }
    } catch {
      toast('Ошибка сети', 'error');
    } finally {
      setActingId(null);
    }
  }

  if (!invites || invites.length === 0) return null;

  return (
    <section style={{ marginBottom: '32px' }}>
      <p
        style={{
          color: 'var(--text-muted)',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: '12px',
        }}
      >
        Приглашения в компании ({invites.length})
      </p>
      <div className="space-y-2">
        {invites.map((inv) => {
          const acting = actingId === inv.id;
          return (
            <div
              key={inv.id}
              className="rounded-2xl p-4"
              style={{
                background: 'var(--surface)',
                border: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)',
              }}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>
                    «{inv.party_title}»
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    От <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{inv.creator_username}</span>
                    {inv.event_date_ts ? ` · ${formatEventDate(inv.event_date_ts)}` : ''}
                  </p>
                </div>
                {inv.event_image_url && (
                  <img
                    src={inv.event_image_url}
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover shrink-0"
                    loading="lazy"
                  />
                )}
              </div>
              {inv.invite_message && (
                <p className="text-xs mb-3 italic" style={{ color: 'var(--text-muted)' }}>
                  «{inv.invite_message}»
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => handleAccept(inv)}
                  disabled={acting}
                  className="flex-1 text-sm font-semibold py-2 rounded-xl transition"
                  style={{
                    background: 'var(--primary)',
                    color: 'white',
                    opacity: acting ? 0.6 : 1,
                  }}
                >
                  Принять
                </button>
                <button
                  onClick={() => handleDecline(inv)}
                  disabled={acting}
                  className="flex-1 text-sm font-semibold py-2 rounded-xl transition"
                  style={{
                    background: 'var(--surface-2)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    opacity: acting ? 0.6 : 1,
                  }}
                >
                  Отклонить
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
