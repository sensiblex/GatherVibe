'use client';

import { useState } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { toast } from './Toast';

const ALLOWED_TAGS = [
  'Пунктуальный',
  'Общительный',
  'Весёлый',
  'Надёжный',
  'Культурный',
  'Интересный собеседник',
  'Помогает другим',
  'Позитивный',
];

export interface ReviewableUser {
  user_id: number;
  username: string;
  avatar_url: string | null;
  party_id: number;
  event_id: string;
}

interface ReviewModalProps {
  users: ReviewableUser[];
  onClose: () => void;
  onAllReviewed: () => void;
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  const active = hovered || value;
  return (
    <div className="flex" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map(star => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          className="focus:outline-none p-1"
          aria-label={`${star} звезда`}
        >
          <svg width="28" height="28" viewBox="0 0 24 24"
            fill={star <= active ? '#f59e0b' : 'none'}
            stroke={star <= active ? '#f59e0b' : '#6b7280'}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function SuccessScreen({ reviewed, remaining, onNext, onClose }: {
  reviewed: ReviewableUser;
  remaining: number;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-3xl"
        style={{ background: '#dcfce7' }}
      >
        ✓
      </div>
      <div>
        <p className="font-black text-lg" style={{ color: 'var(--text)' }}>Отзыв отправлен!</p>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Вы оценили {reviewed.username}
        </p>
      </div>
      {remaining > 0 ? (
        <button
          onClick={onNext}
          className="w-full py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff' }}
        >
          Оценить следующего ({remaining})
        </button>
      ) : (
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff' }}
        >
          Готово
        </button>
      )}
    </div>
  );
}

export default function ReviewModal({ users, onClose, onAllReviewed }: ReviewModalProps) {
  const [index, setIndex] = useState(0);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const current = users[index];

  function toggleTag(tag: string) {
    setTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : prev.length < 3
          ? [...prev, tag]
          : prev
    );
  }

  function advanceOrFinish() {
    const next = index + 1;
    if (next >= users.length) {
      onAllReviewed();
      onClose();
    } else {
      setIndex(next);
      setRating(0);
      setText('');
      setTags([]);
      setShowSuccess(false);
    }
  }

  async function handleSubmit() {
    if (rating === 0) {
      toast('Выберите оценку от 1 до 5', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/reviews/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewed_id: current.user_id,
          party_id: current.party_id,
          rating,
          text: text.trim() || null,
          tags: tags.length > 0 ? tags : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast(err.detail || 'Ошибка при отправке отзыва', 'error');
        return;
      }
      setShowSuccess(true);
    } catch {
      toast('Ошибка сети', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    advanceOrFinish();
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

        {showSuccess ? (
          <SuccessScreen
            reviewed={current}
            remaining={users.length - index - 1}
            onNext={advanceOrFinish}
            onClose={onClose}
          />
        ) : (
          <>
            {/* Progress bar */}
            {users.length > 1 && (
              <div className="space-y-1">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {index + 1} из {users.length}
                </p>
                <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${((index + 1) / users.length) * 100}%`,
                      background: 'linear-gradient(90deg,#4f46e5,#7c3aed)',
                    }}
                  />
                </div>
              </div>
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

            {/* Tags */}
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                Теги{' '}
                <span className="font-normal opacity-60">(до 3)</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ALLOWED_TAGS.map(tag => {
                  const active = tags.includes(tag);
                  const disabled = !active && tags.length >= 3;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => !disabled && toggleTag(tag)}
                      className="text-xs px-2.5 py-1 rounded-full font-medium transition"
                      style={{
                        background: active ? 'var(--primary)' : 'var(--surface-2)',
                        color: active ? '#fff' : 'var(--text-muted)',
                        border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                        opacity: disabled ? 0.45 : 1,
                        cursor: disabled ? 'default' : 'pointer',
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Text */}
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Комментарий{' '}
                <span className="font-normal opacity-60">(необязательно)</span>
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
          </>
        )}
      </div>
    </div>
  );
}
