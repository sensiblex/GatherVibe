'use client';

import { useState, useEffect } from 'react';
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

interface ExistingReview {
  id: number;
  rating: number;
  text: string | null;
  tags: string[] | null;
}

interface ReviewModalProps {
  users: ReviewableUser[];
  onClose: () => void;
  onAllReviewed: () => void;
}

type Step = 'list' | 'form';

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

function UserAvatar({ user, size = 'md' }: { user: ReviewableUser; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'w-10 h-10 text-base' : 'w-12 h-12 text-xl';
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.username}
        className={`${sizeClass} rounded-full object-cover`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-bold`}
      style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
    >
      {user.username.charAt(0).toUpperCase()}
    </div>
  );
}

export default function ReviewModal({ users, onClose, onAllReviewed }: ReviewModalProps) {
  const [step, setStep] = useState<Step>('list');
  const [selectedUser, setSelectedUser] = useState<ReviewableUser | null>(null);
  const [doneIds, setDoneIds] = useState<Set<number>>(new Set());

  // Form state
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [existingReview, setExistingReview] = useState<ExistingReview | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);

  function toggleTag(tag: string) {
    setTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : prev.length < 3
          ? [...prev, tag]
          : prev
    );
  }

  async function openForm(user: ReviewableUser) {
    setSelectedUser(user);
    setRating(0);
    setText('');
    setTags([]);
    setExistingReview(null);
    setStep('form');
    setLoadingExisting(true);
    try {
      const res = await apiFetch(
        `/reviews/my?party_id=${user.party_id}&reviewed_id=${user.user_id}`
      );
      if (res.ok) {
        const data = await res.json() as ExistingReview;
        setExistingReview(data);
        setRating(data.rating);
        setText(data.text ?? '');
        setTags(data.tags ?? []);
      }
      // 404 = no existing review, form stays empty
    } catch {
      // Ignore — treat as no existing review
    } finally {
      setLoadingExisting(false);
    }
  }

  function markDone(userId: number) {
    const updated = new Set(doneIds).add(userId);
    setDoneIds(updated);
    if (updated.size >= users.length) {
      onAllReviewed();
      onClose();
    } else {
      setStep('list');
    }
  }

  async function handleSubmit() {
    if (rating === 0) {
      toast('Выберите оценку от 1 до 5', 'error');
      return;
    }
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      let res: Response;
      if (existingReview) {
        res = await apiFetch(`/reviews/${existingReview.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rating,
            text: text.trim() || null,
            tags: tags.length > 0 ? tags : null,
          }),
        });
      } else {
        res = await apiFetch('/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reviewed_id: selectedUser.user_id,
            party_id: selectedUser.party_id,
            rating,
            text: text.trim() || null,
            tags: tags.length > 0 ? tags : null,
          }),
        });
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast((err as { detail?: string }).detail || 'Ошибка при отправке отзыва', 'error');
        return;
      }
      toast(existingReview ? 'Отзыв обновлён' : 'Отзыв отправлен!', 'success');
      markDone(selectedUser.user_id);
    } catch {
      toast('Ошибка сети', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!existingReview || !selectedUser) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/reviews/${existingReview.id}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        toast('Отзыв удалён', 'success');
        markDone(selectedUser.user_id);
      } else {
        toast('Не удалось удалить отзыв', 'error');
      }
    } catch {
      toast('Ошибка сети', 'error');
    } finally {
      setDeleting(false);
    }
  }

  function handleSkip() {
    if (!selectedUser) return;
    markDone(selectedUser.user_id);
  }

  const remaining = users.length - doneIds.size;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-6 flex flex-col gap-4"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          {step === 'form' ? (
            <button
              onClick={() => setStep('list')}
              className="flex items-center gap-1 text-sm font-semibold transition hover:opacity-70"
              style={{ color: 'var(--text-muted)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Назад
            </button>
          ) : (
            <h2 className="text-lg font-black" style={{ color: 'var(--text)' }}>
              Оценить участников
            </h2>
          )}
          <button
            onClick={onClose}
            className="text-xl leading-none opacity-50 hover:opacity-100 transition"
            style={{ color: 'var(--text)' }}
          >
            ✕
          </button>
        </div>

        {step === 'list' ? (
          <ListStep
            users={users}
            doneIds={doneIds}
            remaining={remaining}
            onSelect={openForm}
          />
        ) : selectedUser ? (
          <FormStep
            user={selectedUser}
            rating={rating}
            text={text}
            tags={tags}
            submitting={submitting}
            deleting={deleting}
            loadingExisting={loadingExisting}
            existingReview={existingReview}
            onRatingChange={setRating}
            onTextChange={setText}
            onTagToggle={toggleTag}
            onSubmit={handleSubmit}
            onSkip={handleSkip}
            onDelete={handleDelete}
          />
        ) : null}
      </div>
    </div>
  );
}

function ListStep({
  users,
  doneIds,
  remaining,
  onSelect,
}: {
  users: ReviewableUser[];
  doneIds: Set<number>;
  remaining: number;
  onSelect: (user: ReviewableUser) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        {remaining > 0
          ? `Осталось оценить: ${remaining} из ${users.length}`
          : 'Все участники оценены'}
      </p>
      <div className="flex flex-col gap-2">
        {users.map(user => {
          const isDone = doneIds.has(user.user_id);
          return (
            <button
              key={user.user_id}
              type="button"
              disabled={isDone}
              onClick={() => !isDone && onSelect(user)}
              className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                opacity: isDone ? 0.5 : 1,
                cursor: isDone ? 'default' : 'pointer',
              }}
            >
              <UserAvatar user={user} size="sm" />
              <span className="flex-1 font-semibold text-sm" style={{ color: 'var(--text)' }}>
                {user.username}
              </span>
              {isDone ? (
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-sm"
                  style={{ background: '#dcfce7', color: '#16a34a' }}
                >
                  ✓
                </span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FormStep({
  user,
  rating,
  text,
  tags,
  submitting,
  deleting,
  loadingExisting,
  existingReview,
  onRatingChange,
  onTextChange,
  onTagToggle,
  onSubmit,
  onSkip,
  onDelete,
}: {
  user: ReviewableUser;
  rating: number;
  text: string;
  tags: string[];
  submitting: boolean;
  deleting: boolean;
  loadingExisting: boolean;
  existingReview: ExistingReview | null;
  onRatingChange: (v: number) => void;
  onTextChange: (v: string) => void;
  onTagToggle: (tag: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  onDelete: () => void;
}) {
  if (loadingExisting) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary)' }} />
      </div>
    );
  }

  return (
    <>
      {/* User info */}
      <div className="flex items-center gap-3">
        <UserAvatar user={user} />
        <div>
          <p className="font-bold text-base" style={{ color: 'var(--text)' }}>
            {user.username}
          </p>
          {existingReview && (
            <p className="text-xs" style={{ color: 'var(--primary)' }}>
              Редактирование отзыва
            </p>
          )}
        </div>
      </div>

      {/* Stars */}
      <div>
        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
          Оценка
        </p>
        <StarPicker value={rating} onChange={onRatingChange} />
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
                onClick={() => !disabled && onTagToggle(tag)}
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
          onChange={e => onTextChange(e.target.value)}
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
      {existingReview ? (
        <div className="flex flex-col gap-2">
          <button
            onClick={onSubmit}
            disabled={submitting || rating === 0}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff' }}
          >
            {submitting ? 'Сохранение…' : 'Сохранить изменения'}
          </button>
          <button
            onClick={onDelete}
            disabled={deleting || submitting}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-80 disabled:opacity-50"
            style={{
              background: 'color-mix(in oklch, #ef4444 12%, transparent)',
              color: '#ef4444',
              border: '1px solid color-mix(in oklch, #ef4444 30%, transparent)',
            }}
          >
            {deleting ? 'Удаление…' : 'Удалить отзыв'}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onSkip}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition hover:opacity-80"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            Пропустить
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting || rating === 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff' }}
          >
            {submitting ? 'Отправка…' : 'Отправить'}
          </button>
        </div>
      )}
    </>
  );
}
