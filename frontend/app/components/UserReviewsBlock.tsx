'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../lib/apiFetch';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ReviewOut {
  id: number;
  reviewer_id: number;
  reviewer_username: string;
  reviewer_avatar_url: string | null;
  rating: number;
  text: string | null;
  tags: string[] | null;
  created_at: string;
}

interface ReviewSummary {
  avg_rating: number | null;
  total_reviews: number;
  reviews: ReviewOut[];
  stars_distribution: Record<number, number>;
  top_tags: string[];
}

interface UserReviewsBlockProps {
  userId: number;
  /** Displayed above the review list. Pass reviewer's own id to hide report button on own reviews. */
  viewerUserId?: number;
  /** Max number of reviews to display. Defaults to 5. */
  maxReviews?: number;
  /** Whether to show a "report" button on reviews. */
  showReport?: boolean;
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <svg key={star} width={size} height={size} viewBox="0 0 24 24"
          fill={star <= rating ? '#f59e0b' : 'none'}
          stroke={star <= rating ? '#f59e0b' : '#9ca3af'}
          strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

function pluralReviews(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'отзыв';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'отзыва';
  return 'отзывов';
}

export default function UserReviewsBlock({
  userId,
  viewerUserId,
  maxReviews = 5,
  showReport = false,
}: UserReviewsBlockProps) {
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportedIds, setReportedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    apiFetch(`${API_BASE}/users/${userId}/reviews`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => setSummary(data ?? null))
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [userId]);

  async function handleReport(reviewId: number) {
    try {
      const res = await apiFetch(`${API_BASE}/reviews/${reviewId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.status === 409) {
        // Already reported — mark locally anyway
        setReportedIds(prev => new Set(prev).add(reviewId));
        return;
      }
      if (res.ok) {
        setReportedIds(prev => new Set(prev).add(reviewId));
      }
    } catch {
      // Silently ignore
    }
  }

  if (loading) {
    return (
      <div
        className="rounded-3xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
      >
        <div className="animate-pulse space-y-3">
          <div className="h-5 rounded w-1/4" style={{ background: 'var(--surface-2)' }} />
          <div className="h-20 rounded-2xl" style={{ background: 'var(--surface-2)' }} />
          <div className="h-16 rounded-2xl" style={{ background: 'var(--surface-2)' }} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-3xl p-6"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
    >
      <h2 className="text-lg font-black mb-4" style={{ color: 'var(--text)' }}>
        Отзывы
      </h2>

      {!summary || summary.total_reviews === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* ── Summary ── */}
          <div className="flex items-start gap-6 mb-5">
            {/* Average rating */}
            <div className="text-center shrink-0">
              <p className="text-4xl font-black" style={{ color: 'var(--primary)' }}>
                {summary.avg_rating?.toFixed(1)}
              </p>
              <StarRow rating={Math.round(summary.avg_rating ?? 0)} />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {summary.total_reviews} {pluralReviews(summary.total_reviews)}
              </p>
            </div>

            {/* Stars distribution bars */}
            <div className="flex-1 space-y-1.5">
              {[5, 4, 3, 2, 1].map(star => {
                const count = summary.stars_distribution[star] ?? 0;
                const pct = summary.total_reviews > 0
                  ? (count / summary.total_reviews) * 100
                  : 0;
                return (
                  <div key={star} className="flex items-center gap-2">
                    <span className="text-xs w-3 shrink-0 text-right" style={{ color: 'var(--text-muted)' }}>
                      {star}
                    </span>
                    <div
                      className="flex-1 h-1.5 rounded-full overflow-hidden"
                      style={{ background: 'var(--border)' }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: '#f59e0b' }}
                      />
                    </div>
                    <span className="text-xs w-5 shrink-0" style={{ color: 'var(--text-faint, #aaa)' }}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Top tags ── */}
          {summary.top_tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {summary.top_tags.slice(0, 5).map(tag => (
                <span
                  key={tag}
                  className="text-xs px-2.5 py-1 rounded-full font-medium"
                  style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* ── Review list ── */}
          <div className="space-y-3">
            {summary.reviews.slice(0, maxReviews).map(review => (
              <div
                key={review.id}
                className="rounded-2xl p-4"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
              >
                {/* Reviewer header */}
                <div className="flex items-center gap-2 mb-1">
                  {review.reviewer_avatar_url ? (
                    <img
                      src={review.reviewer_avatar_url}
                      alt={review.reviewer_username}
                      className="w-7 h-7 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
                    >
                      {review.reviewer_username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <Link
                    href={`/users/${review.reviewer_id}`}
                    className="text-sm font-bold transition hover:opacity-70"
                    style={{ color: 'var(--primary)' }}
                  >
                    {review.reviewer_username}
                  </Link>
                  <div className="flex gap-0.5 ml-auto">
                    <StarRow rating={review.rating} size={13} />
                  </div>
                </div>

                {/* Tags */}
                {review.tags && review.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {review.tags.map(tag => (
                      <span
                        key={tag}
                        className="text-[11px] px-2 py-0.5 rounded-full"
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Review text */}
                {review.text && (
                  <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>
                    {review.text}
                  </p>
                )}

                {/* Footer: date + report */}
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs" style={{ color: 'var(--text-faint, #aaa)' }}>
                    {new Date(review.created_at).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                  {showReport && viewerUserId && viewerUserId !== review.reviewer_id && (
                    reportedIds.has(review.id) ? (
                      <span className="text-xs" style={{ color: 'var(--text-faint, #aaa)' }}>
                        Жалоба отправлена
                      </span>
                    ) : (
                      <button
                        onClick={() => handleReport(review.id)}
                        className="text-xs transition hover:opacity-70"
                        style={{ color: 'var(--text-faint, #aaa)' }}
                      >
                        Пожаловаться
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-10">
      <div className="flex justify-center mb-3">
        <svg width="48" height="48" viewBox="0 0 24 24"
          fill="none" stroke="#f59e0b" strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round"
          style={{ opacity: 0.35 }}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </div>
      <p className="font-semibold text-sm" style={{ color: 'var(--text-muted)' }}>
        Ещё нет отзывов
      </p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-faint, #aaa)' }}>
        Отзывы появляются после совместных посещений событий
      </p>
    </div>
  );
}
