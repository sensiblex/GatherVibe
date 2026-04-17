'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { useSimilarPeople, type SimilarPerson } from '../hooks/useSimilarPeople';

function scoreColor(score: number): string {
  if (score >= 70) return '#16a34a';
  if (score >= 40) return '#d97706';
  return '#64748b';
}

function PersonCard({ person }: { person: SimilarPerson }) {
  const color = scoreColor(person.match_score);
  return (
    <Link
      href={`/users/${person.user_id}`}
      className="block flex-shrink-0 w-[260px] md:w-auto rounded-2xl overflow-hidden transition hover:-translate-y-0.5"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="p-5">
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center font-bold text-lg"
            style={{
              background: 'var(--primary-hl)',
              color: 'var(--primary)',
              border: '2px solid var(--surface)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            {person.avatar_url ? (
              <Image
                src={person.avatar_url}
                alt={person.username}
                width={56}
                height={56}
                className="object-cover w-full h-full"
                unoptimized
              />
            ) : (
              person.username.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-base truncate" style={{ color: 'var(--text)' }}>
              {person.username}
            </h3>
            {person.city && (
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                📍 {person.city}
              </p>
            )}
          </div>
          <span
            className="px-2 py-1 rounded-full text-xs font-bold text-white"
            style={{ background: color }}
          >
            {person.match_score}%
          </span>
        </div>

        {person.bio && (
          <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--text-muted)' }}>
            {person.bio}
          </p>
        )}

        {person.match_reasons.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {person.match_reasons.map((r) => (
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
      </div>
    </Link>
  );
}

export default function RecommendedPeopleSection() {
  const { user, isLoading: authLoading } = useAuth();
  const { people, loading } = useSimilarPeople(8);

  if (authLoading || !user) return null;

  return (
    <section className="py-16" style={{ background: 'var(--bg)' }}>
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <h2 className="text-3xl md:text-4xl font-black mb-2" style={{ color: 'var(--text)' }}>
            Похожие на тебя
          </h2>
          <p className="text-base" style={{ color: 'var(--text-muted)' }}>
            Ребята из твоего города с близкими интересами
          </p>
        </div>

        {loading ? (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex-shrink-0 w-[260px] h-48 rounded-2xl animate-pulse"
                style={{ background: 'var(--surface-2)' }}
              />
            ))}
          </div>
        ) : people.length === 0 ? (
          <div
            className="p-6 text-center rounded-2xl"
            style={{
              background: 'var(--surface)',
              border: '1px dashed var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            Пока никого похожего. Заполни интересы в профиле — найдём единомышленников 🤝
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto md:grid md:grid-cols-3 lg:grid-cols-4 md:overflow-visible pb-2">
            {people.map((p) => (
              <PersonCard key={p.user_id} person={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
