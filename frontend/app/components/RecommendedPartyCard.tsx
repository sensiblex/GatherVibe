'use client';

import Link from 'next/link';
import Image from 'next/image';
import type { RecommendedParty } from '../hooks/useRecommendedParties';

function scoreColor(score: number): string {
  if (score >= 70) return '#16a34a';
  if (score >= 40) return '#d97706';
  return '#64748b';
}

function formatDate(ts: number | null): string | null {
  if (!ts) return null;
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export default function RecommendedPartyCard({ party }: { party: RecommendedParty }) {
  const color = scoreColor(party.match_score);
  const dateLabel = formatDate(party.event_date_ts);
  const extra = Math.max(0, party.member_count - party.members_preview.length);

  return (
    <Link
      href={`/parties/${party.party_id}`}
      className="block flex-shrink-0 w-[320px] md:w-auto rounded-2xl overflow-hidden transition hover:-translate-y-0.5"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="relative w-full h-40 bg-gray-100">
        {party.event_image ? (
          <Image
            src={party.event_image}
            alt={party.event_title}
            fill
            sizes="320px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">🎭</div>
        )}

        <span
          className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-bold text-white"
          style={{ background: color, boxShadow: 'var(--shadow-sm)' }}
        >
          ✨ Рекомендуем
        </span>
      </div>

      <div className="p-4">
        <h3
          className="text-base font-bold mb-1 line-clamp-2"
          style={{ color: 'var(--text)' }}
        >
          {party.event_title}
        </h3>

        {dateLabel && (
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            {dateLabel}
          </p>
        )}

        {party.match_reasons.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {party.match_reasons.map((r) => (
              <span
                key={r}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                style={{
                  background: 'var(--primary-hl)',
                  color: 'var(--primary)',
                }}
              >
                {r}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex -space-x-2">
              {party.members_preview.map((m) => (
                <div
                  key={m.user_id}
                  className="w-7 h-7 rounded-full border-2 overflow-hidden flex items-center justify-center text-xs font-bold"
                  style={{
                    borderColor: 'var(--surface)',
                    background: 'var(--primary-hl)',
                    color: 'var(--primary)',
                  }}
                  title={m.username}
                >
                  {m.avatar ? (
                    <Image
                      src={m.avatar}
                      alt={m.username}
                      width={28}
                      height={28}
                      className="object-cover w-full h-full"
                      unoptimized
                    />
                  ) : (
                    m.username.slice(0, 1).toUpperCase()
                  )}
                </div>
              ))}
              {extra > 0 && (
                <div
                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold"
                  style={{
                    borderColor: 'var(--surface)',
                    background: 'var(--surface-2)',
                    color: 'var(--text-muted)',
                  }}
                >
                  +{extra}
                </div>
              )}
            </div>
            <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              {party.spots_left > 0
                ? `${party.spots_left} ${party.spots_left === 1 ? 'место' : 'мест'}`
                : 'Мест нет'}
            </span>
          </div>

          <span
            className="text-xs font-semibold"
            style={{ color: 'var(--primary)' }}
          >
            Подробнее →
          </span>
        </div>
      </div>
    </Link>
  );
}
