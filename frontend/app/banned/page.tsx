'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { toast } from '../components/Toast';

function BannedInner() {
  const sp = useSearchParams();
  const until = sp.get('until');
  const reason = sp.get('reason');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const untilText = until
    ? new Date(until).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })
    : null;

  const submitAppeal = async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    try {
      const r = await apiFetch('/appeals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() }),
      });
      if (r.ok) {
        setSubmitted(true);
        toast('Апелляция отправлена', 'success');
      } else if (r.status === 409) {
        setSubmitted(true);
        toast('Апелляция уже на рассмотрении', 'info');
      } else {
        const b = await r.json().catch(() => ({}));
        toast(b?.detail || 'Ошибка', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ maxWidth: 560, margin: '80px auto', padding: 24, textAlign: 'center' }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Аккаунт заблокирован</h1>
      {reason && <p style={{ opacity: 0.85 }}>Причина: {decodeURIComponent(reason)}</p>}
      {untilText ? (
        <p>Блокировка снимается автоматически: {untilText}</p>
      ) : (
        <p>Блокировка бессрочная.</p>
      )}

      {!submitted ? (
        <div style={{ marginTop: 24, textAlign: 'left' }}>
          <h3>Подать апелляцию</h3>
          <p style={{ fontSize: 13, opacity: 0.7 }}>
            Опишите, почему вы считаете блокировку ошибочной. Модератор рассмотрит заявку.
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            data-testid="appeal-message"
            maxLength={1000}
            minLength={5}
            rows={4}
            style={{ width: '100%', padding: 8, marginTop: 8 }}
            placeholder="Текст апелляции (мин. 5 символов)"
          />
          <button
            className="btn btn-ink btn-sm"
            data-testid="appeal-submit"
            style={{ marginTop: 8 }}
            disabled={busy || message.trim().length < 5}
            onClick={submitAppeal}
          >
            {busy ? 'Отправка…' : 'Отправить апелляцию'}
          </button>
        </div>
      ) : (
        <p data-testid="appeal-submitted" style={{ marginTop: 24, color: '#059669' }}>
          ✓ Апелляция отправлена. Ожидайте ответа.
        </p>
      )}

      <p style={{ marginTop: 24 }}>
        <Link href="/login" className="btn btn-ghost btn-sm">На страницу входа</Link>
      </p>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Загрузка…</div>}>
      <BannedInner />
    </Suspense>
  );
}
