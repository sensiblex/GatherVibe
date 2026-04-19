'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiFetch';

interface Me { muted_until: string | null; banned_until: string | null; is_banned: boolean; ban_reason: string | null; }

export default function MuteBanner() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    apiFetch('/users/me')
      .then(async (r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  if (!me) return null;

  // Backend шлёт naive ISO (UTC) без 'Z' — принудительно трактуем как UTC
  const asUtc = (iso: string | null): number => {
    if (!iso) return 0;
    const withZ = /[Zz]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z';
    return new Date(withZ).getTime();
  };

  const now = Date.now();
  const muteUntil = asUtc(me.muted_until);
  const banUntil = asUtc(me.banned_until);

  const isMuted = muteUntil > now;
  const isTempBanned = me.is_banned && banUntil > now;

  if (!isMuted && !isTempBanned) return null;

  const text = isTempBanned
    ? `Ваш аккаунт ограничен до ${new Date(banUntil).toLocaleString('ru-RU')}${me.ban_reason ? ` — ${me.ban_reason}` : ''}`
    : `Отправка сообщений отключена до ${new Date(muteUntil).toLocaleString('ru-RU')}`;

  return (
    <div
      data-testid="mute-banner"
      style={{
        background: '#fef3c7',
        color: '#92400e',
        padding: '10px 16px',
        borderBottom: '1px solid #fbbf24',
        textAlign: 'center',
        fontSize: 14,
      }}
    >
      ⚠️ {text}
    </div>
  );
}
