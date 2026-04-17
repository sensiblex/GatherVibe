'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { useAuth } from '../context/AuthContext';

export interface SimilarPerson {
  user_id: number;
  username: string;
  avatar_url: string | null;
  city: string | null;
  interests: string | null;
  bio: string | null;
  match_score: number;
  match_reasons: string[];
}

export function useSimilarPeople(limit = 12, cityOnly = true) {
  const { user, isLoading: authLoading } = useAuth();
  const [people, setPeople] = useState<SimilarPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setPeople([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch(`/users/me/similar-people?limit=${limit}&city_only=${cityOnly}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as SimilarPerson[];
      })
      .then((d) => {
        if (!cancelled) setPeople(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, limit, cityOnly]);

  return { people, loading, error };
}
