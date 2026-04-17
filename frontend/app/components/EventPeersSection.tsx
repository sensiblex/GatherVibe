'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { useAuth } from '../context/AuthContext';
import type { SimilarPerson } from '../hooks/useSimilarPeople';

interface Props {
  eventId: string;
}

export default function EventPeersSection({ eventId }: Props) {
  const { user, isLoading: authLoading } = useAuth();
  const [peers, setPeers] = useState<SimilarPerson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch(`/events/${encodeURIComponent(eventId)}/peers?limit=10`)
      .then(async (r) => (r.ok ? ((await r.json()) as SimilarPerson[]) : []))
      .then((d) => {
        if (!cancelled) setPeers(d);
      })
      .catch(() => {
        if (!cancelled) setPeers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, user, authLoading]);

  if (authLoading || !user) return null;
  if (!loading && peers.length === 0) return null;

  return (
    <section className="mt-8">
      <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>
        👥 Совместимые участники
      </h3>
      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex-shrink-0 w-[220px] h-28 rounded-xl animate-pulse"
              style={{ background: 'var(--surface-2)' }}
            />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {peers.map((p) => (
            <Link
              key={p.user_id}
              href={`/users/${p.user_id}`}
              className="flex-shrink-0 w-[220px] rounded-xl p-3 transition hover:-translate-y-0.5"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center font-bold"
                  style={{
                    background: 'var(--primary-hl)',
                    color: 'var(--primary)',
                  }}
                >
                  {p.avatar_url ? (
                    <Image
                      src={p.avatar_url}
                      alt={p.username}
                      width={40}
                      height={40}
                      className="object-cover w-full h-full"
                      unoptimized
                    />
                  ) : (
                    p.username.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate text-sm" style={{ color: 'var(--text)' }}>
                    {p.username}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--primary)' }}>
                    {p.match_score}% совпадение
                  </p>
                </div>
              </div>
              {p.match_reasons.length > 0 && (
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  {p.match_reasons[0]}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
