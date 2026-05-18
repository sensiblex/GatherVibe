'use client';

import { useEffect, useState } from 'react';
import {
  dismissPermissionPrompt,
  getPushStatus,
  shouldShowPermissionPrompt,
  subscribeToPush,
} from '../lib/push';
import { toast } from './Toast';

type Props = {
  /**
   * If provided, the prompt only shows when this trigger is truthy AND
   * shouldShowPermissionPrompt() allows it. Use for value-moment triggers
   * (e.g. `trigger={justAcceptedToParty}`).
   */
  trigger?: boolean;
  /** Tone: 'banner' (full-width card) or 'toast' (floating bottom-right). */
  variant?: 'banner' | 'toast';
  /** Short custom message overriding the default. */
  message?: string;
};

const DEFAULT_MESSAGE =
  'Включи уведомления, чтобы не пропускать сообщения и приглашения от компаний.';

export default function PushPermissionPrompt({
  trigger = true,
  variant = 'banner',
  message = DEFAULT_MESSAGE,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!trigger) {
      setVisible(false);
      return;
    }
    setVisible(shouldShowPermissionPrompt());
  }, [trigger]);

  if (!visible) return null;

  const handleEnable = async () => {
    setBusy(true);
    try {
      const ok = await subscribeToPush();
      if (ok) {
        toast('Уведомления включены', 'success');
        setVisible(false);
      } else {
        const status = getPushStatus();
        if (status === 'denied') {
          toast('Разрешение отклонено браузером. Можно включить в настройках сайта.', 'error');
          setVisible(false);
        } else if (status === 'unsupported') {
          toast('Этот браузер не поддерживает push-уведомления', 'error');
          setVisible(false);
        } else {
          toast('Не удалось подписаться. Попробуй ещё раз.', 'error');
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = () => {
    dismissPermissionPrompt();
    setVisible(false);
  };

  if (variant === 'toast') {
    return (
      <div
        data-testid="push-permission-prompt"
        className="fixed bottom-5 right-5 z-50 max-w-sm rounded-2xl p-4 shadow-lg"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <p className="text-sm mb-3" style={{ color: 'var(--text)' }}>{message}</p>
        <div className="flex gap-2">
          <button
            onClick={handleEnable}
            disabled={busy}
            className="flex-1 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Включаю…' : 'Включить'}
          </button>
          <button
            onClick={handleDismiss}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            Позже
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="push-permission-prompt"
      className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl p-4"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
    >
      <div className="flex-1 text-sm" style={{ color: 'var(--text)' }}>
        {message}
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={handleEnable}
          disabled={busy}
          className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Включаю…' : 'Включить'}
        </button>
        <button
          onClick={handleDismiss}
          disabled={busy}
          className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          Позже
        </button>
      </div>
    </div>
  );
}
