'use client';

import { useState } from 'react';
import { apiFetch } from '../../lib/apiFetch';
import { toast } from '../../components/Toast';

export default function BroadcastPage() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (sending) return;
    if (!title.trim() || !message.trim()) { toast('Заполните поля', 'error'); return; }
    setSending(true);
    try {
      const r = await apiFetch('/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), message: message.trim() }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok) {
        toast(`Разослано ${body.sent || 0} получателям`, 'success');
        setTitle(''); setMessage('');
      } else {
        toast(body?.detail || 'Ошибка', 'error');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <h1>Системная рассылка</h1>
      <p style={{ opacity: 0.7, marginBottom: 16 }}>
        Сообщение получат все активные пользователи в ленте уведомлений.
      </p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Заголовок"
        data-testid="broadcast-title"
        maxLength={120}
        style={{ display: 'block', width: '100%', padding: 8, marginBottom: 8 }}
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Текст сообщения"
        data-testid="broadcast-message"
        maxLength={1000}
        rows={5}
        style={{ display: 'block', width: '100%', padding: 8, marginBottom: 12 }}
      />
      <button
        className="btn btn-ink btn-sm"
        data-testid="broadcast-send"
        disabled={sending}
        onClick={send}
      >
        {sending ? 'Отправка…' : 'Разослать'}
      </button>
    </>
  );
}
