'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { useAuth } from '../context/AuthContext';

export interface RecommendedEvent {
  event_id: string;
  kudago_id: number;
  title: string;
  description: string | null;
  cover_url: string | null;
  start_ts: number | null;
  location: string;
  place_title: string | null;
  place_address: string | null;
  is_free: boolean;
  price: string | null;
  favorites_count: number;
  match_score: number;
  match_reasons: string[];
}

export function useRecommendedEvents(limit = 12) {
  const { user, isLoading: authLoading } = useAuth();
  const [events, setEvents] = useState<RecommendedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (authLoading) return;
    if (!user) {
      setEvents([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch(`/users/me/recommended-events?limit=${limit}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as RecommendedEvent[];
      })
      .then((data) => {
        if (!cancelled) setEvents(data);
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
  }, [user, authLoading, limit]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  const dismissEvent = useCallback(
    (event_id: string) => {
      setEvents((prev) => prev.filter((e) => e.event_id !== event_id));
      apiFetch('/recommendations/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rec_type: 'event',
          target_id: event_id,
          action: 'dismissed',
          surface: 'home_feed',
        }),
      }).catch(() => {
        // best-effort; re-load on next mount
      });
    },
    []
  );

  const likeEvent = useCallback((event_id: string, score?: number) => {
    apiFetch('/recommendations/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rec_type: 'event',
        target_id: event_id,
        action: 'liked',
        score,
        surface: 'home_feed',
      }),
    }).catch(() => {});
  }, []);

  return { events, loading, error, dismissEvent, likeEvent, reload: load };
}
