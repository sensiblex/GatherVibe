'use client';

import Link from 'next/link';
import { useAuth } from '../context/AuthContext';
import { useRecommendedParties } from '../hooks/useRecommendedParties';
import RecommendedPartyCard from './RecommendedPartyCard';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiFetch';

function useMyInterests() {
  const { user, isLoading: authLoading } = useAuth();
  const [interests, setInterests] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (authLoading || !user) {
      setInterests(undefined);
      return;
    }
    let cancelled = false;
    apiFetch(`/users/${user.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setInterests(data?.interests ?? null);
      })
      .catch(() => {
        if (!cancelled) setInterests(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { interests, loading: interests === undefined };
}

export default function RecommendedPartiesSection() {
  const { user, isLoading: authLoading } = useAuth();
  const { parties, loading } = useRecommendedParties(6);
  const { interests, loading: interestsLoading } = useMyInterests();

  if (authLoading || !user) return null;

  const hasInterests = !!(interests && interests.trim().length > 0);
  const isInitialLoading = loading || interestsLoading;

  return (
    <section className="py-16" style={{ background: 'var(--bg)' }}>
      <div className="container mx-auto px-4">
        <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-3xl md:text-4xl font-black mb-2" style={{ color: 'var(--text)' }}>
              Группы для тебя
            </h2>
            <p className="text-base" style={{ color: 'var(--text-muted)' }}>
              Подобрано на основе твоих интересов
            </p>
          </div>
          {hasInterests && parties.length > 0 && (
            <Link
              href="/parties"
              className="text-sm font-semibold hover:opacity-70 transition"
              style={{ color: 'var(--primary)' }}
            >
              Все группы →
            </Link>
          )}
        </div>

        {isInitialLoading ? (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex-shrink-0 w-[320px] h-72 rounded-2xl animate-pulse"
                style={{ background: 'var(--surface-2)' }}
              />
            ))}
          </div>
        ) : !hasInterests ? (
          <div
            className="gv-card p-8 text-center max-w-xl mx-auto"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div className="text-4xl mb-3">🎯</div>
            <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>
              Заполни интересы
            </h3>
            <p className="mb-5" style={{ color: 'var(--text-muted)' }}>
              Укажи свои увлечения в профиле — подберём подходящие группы
            </p>
            <Link href="/profile" className="gv-btn-primary inline-block">
              Заполнить профиль
            </Link>
          </div>
        ) : parties.length === 0 ? (
          <div
            className="p-6 text-center rounded-2xl"
            style={{
              background: 'var(--surface)',
              border: '1px dashed var(--border)',
              color: 'var(--text-muted)',
            }}
          >
            Пока нет подходящих групп. Загляни позже или создай свою 🎉
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto md:grid md:grid-cols-3 md:overflow-visible pb-2">
            {parties.map((p) => (
              <RecommendedPartyCard key={p.party_id} party={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
