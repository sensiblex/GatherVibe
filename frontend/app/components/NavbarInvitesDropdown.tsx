'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from './Toast';
import { useAuth } from '../context/AuthContext';
import { useInvites } from '../context/InvitesContext';
import {
  type PartyInvite,
  acceptInvite,
  declineInvite,
} from '../lib/partyInviteApi';

export default function NavbarInvitesDropdown() {
  const { token } = useAuth();
  const { invites, count, isLoaded, refresh } = useInvites();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function handleAccept(inv: PartyInvite) {
    setActingId(inv.id);
    const res = await acceptInvite(inv.party_id, inv.id).catch(() => null);
    setActingId(null);
    if (res && res.ok) {
      await refresh();
      window.dispatchEvent(new Event('party-invites:changed'));
      toast('Вы присоединились к компании', 'success', {
        label: 'Открыть',
        onClick: () => router.push(`/parties/${inv.party_id}`),
      });
    } else {
      toast('Не удалось принять приглашение', 'error');
    }
  }

  async function handleDecline(inv: PartyInvite) {
    setActingId(inv.id);
    const res = await declineInvite(inv.party_id, inv.id).catch(() => null);
    setActingId(null);
    if (res && res.ok) {
      await refresh();
      window.dispatchEvent(new Event('party-invites:changed'));
    } else {
      toast('Не удалось отклонить приглашение', 'error');
    }
  }

  if (!token || !isLoaded) return null;

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="icon-btn"
        aria-label="Приглашения"
        aria-expanded={open}
        style={{ position: 'relative' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 12 20 22 4 22 4 12" />
          <rect x="2" y="7" width="20" height="5" />
          <line x1="12" y1="22" x2="12" y2="7" />
          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
        </svg>
        {count > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: '0 5px',
              borderRadius: 9,
              background: 'var(--primary)',
              color: 'white',
              fontSize: 11,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 340,
            maxHeight: 420,
            overflowY: 'auto',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: 'var(--shadow-md)',
            padding: 12,
            zIndex: 1000,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Приглашения в компании
            </p>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-semibold"
              style={{ color: 'var(--primary)' }}
            >
              Все
            </Link>
          </div>

          {count === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>
              Нет активных приглашений
            </p>
          ) : (
            <div className="space-y-2">
              {invites.map((inv) => {
                const acting = actingId === inv.id;
                return (
                  <div
                    key={inv.id}
                    className="rounded-xl p-3"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--text)' }}>
                      «{inv.party_title}»
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      От {inv.creator_username}
                    </p>
                    {inv.invite_message && (
                      <p className="text-xs mt-1 italic" style={{ color: 'var(--text-muted)' }}>
                        «{inv.invite_message}»
                      </p>
                    )}
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleAccept(inv)}
                        disabled={acting}
                        className="flex-1 text-xs font-semibold py-1.5 rounded-lg"
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
                        className="flex-1 text-xs font-semibold py-1.5 rounded-lg"
                        style={{
                          background: 'var(--surface)',
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
          )}
        </div>
      )}
    </div>
  );
}
