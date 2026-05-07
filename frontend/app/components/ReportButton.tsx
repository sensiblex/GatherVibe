'use client';

import { useState } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { toast } from './Toast';

type TargetType = 'chat_message' | 'party' | 'user' | 'review' | 'recap_item';

interface Props {
  targetType: TargetType;
  targetId: string | number;
  className?: string;
  label?: string;
  compact?: boolean;
}

const REASONS: { value: string; label: string }[] = [
  { value: 'spam', label: 'Спам' },
  { value: 'harassment', label: 'Оскорбления / травля' },
  { value: 'nsfw', label: 'Непристойное содержимое' },
  { value: 'fake', label: 'Обман / фейк' },
  { value: 'other', label: 'Другое' },
];

export default function ReportButton({ targetType, targetId, className, label, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('spam');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const r = await apiFetch('/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: targetType,
          target_id: String(targetId),
          reason,
          comment: comment.trim() || null,
        }),
      });
      if (r.ok) {
        toast('Жалоба отправлена, спасибо', 'success');
        setOpen(false);
        setComment('');
      } else if (r.status === 409) {
        toast('Вы уже жаловались на этот объект', 'info');
        setOpen(false);
      } else {
        const body = await r.json().catch(() => ({}));
        toast(body?.detail?.message || body?.detail || 'Не удалось отправить жалобу', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={className || (compact ? 'btn btn-ghost btn-xs' : 'btn btn-ghost btn-sm')}
        data-testid={`report-btn-${targetType}-${targetId}`}
        onClick={() => setOpen(true)}
      >
        {label || 'Пожаловаться'}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Форма жалобы"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--card-bg, #fff)', padding: 24, borderRadius: 12,
              maxWidth: 420, width: '90%', color: 'var(--ink)',
            }}
          >
            <h3 style={{ margin: 0, marginBottom: 12 }}>Пожаловаться</h3>
            <label style={{ display: 'block', marginBottom: 8 }}>Причина</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="report-reason"
              style={{ width: '100%', padding: 8, marginBottom: 12, borderRadius: 6 }}
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <label style={{ display: 'block', marginBottom: 8 }}>Комментарий (необязательно)</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              data-testid="report-comment"
              maxLength={500}
              rows={3}
              style={{ width: '100%', padding: 8, marginBottom: 12, borderRadius: 6 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
                Отмена
              </button>
              <button
                type="button"
                className="btn btn-ink btn-sm"
                data-testid="report-submit"
                onClick={submit}
                disabled={submitting}
              >
                {submitting ? 'Отправка…' : 'Отправить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
