'use client';

import { useState } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { toast } from './Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface ReviewableUser {
  user_id: number;
  username: string;
  avatar_url: string | null;
  party_id: number;
}

interface ReviewModalProps {
  users: ReviewableUser[];
  onClose: () => void;
  onAllReviewed: () => void;
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          className="text-2xl transition-transform hover:scale-110 focus:outline-none"
        >
          {star <= (hovered || value) ? '⭐' : '☆'}
        </button>
      ))}
    </div>
  );
}

export default function ReviewModal({ users, onClose, onAllReviewed }: ReviewModalProps) {
  const [index, setIndex] = useState(0);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const current = users[index];

  async function handleSubmit() {
    if (rating === 0) {
      toast('Выберите оценку от 1 до 5', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`${API_BASE}/reviews/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewed_id: current.user_id,
          party_id: current.party_id,
          rating,
          text: text.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.detail || 'Ошибка при отправке отзыва', 'error');
        return;
      }
      toast('Отзыв отправлен', 'success');
      const next = index + 1;
      if (next >= users.length) {
        onAllReviewed();
        onClose();
      } else {
        setIndex(next);
        setRating(0);
        setText('');
      }
    } catch {
      toast('Ошибка сети', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    const next = index + 1;
    if (next >= users.length) {
      onClose();
    } else {
      setIndex(next);
      setRating(0);
      setText('');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-6 flex flex-col gap-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black" style={{ color: 'var(--text)' }}>
            Оценить участника
          </h2>
          <button
            onClick={onClose}
            className="text-xl leading-none opacity-50 hover:opacity-100 transition"
            style={{ color: 'var(--text)' }}
          >
            ✕
          </button>
        </div>

        {/* Progress */}
        {users.length > 1 && (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {index + 1} из {users.length}
          </p>
        )}

        {/* User info */}
        <div className="flex items-center gap-3">
          {current.avatar_url ? (
            <img
              src={current.avatar_url}
              alt={current.username}
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold"
              style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
            >
              {current.username.charAt(0).toUpperCase()}
            </div>
          )}
          <p className="font-bold text-base" style={{ color: 'var(--text)' }}>
            {current.username}
          </p>
        </div>

        {/* Stars */}
        <div>
          <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
            Оценка
          </p>
          <StarPicker value={rating} onChange={setRating} />
        </div>

        {/* Text */}
        <div>
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
            Комментарий (необязательно)
          </p>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Напишите пару слов..."
            className="w-full rounded-xl px-3 py-2 text-sm resize-none focus:outline-none"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleSkip}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-80"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            Пропустить
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || rating === 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff' }}
          >
            {submitting ? 'Отправка…' : 'Отправить'}
          </button>
        </div>
      </div>
    </div>
  );
}
