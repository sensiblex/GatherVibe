'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import { apiFetch } from '../../lib/apiFetch';
import { useAuth } from '../../context/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Только публичные поля — email, hashed_password, is_active намеренно исключены
interface PublicUser {
  id: number;
  username: string;
  city: string | null;
  bio: string | null;
  interests: string | null;
}

function parseInterests(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function ProfileSkeleton() {
  return (
    <div className="animate-pulse">
      <div
        className="rounded-3xl p-8 mb-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex gap-6 items-center">
          <div className="w-24 h-24 rounded-full shrink-0" style={{ background: 'var(--surface-2)' }} />
          <div className="space-y-3 flex-1">
            <div className="h-6 rounded w-1/3" style={{ background: 'var(--surface-2)' }} />
            <div className="h-4 rounded w-1/4" style={{ background: 'var(--surface-2)' }} />
            <div className="h-4 rounded w-2/3" style={{ background: 'var(--surface-2)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Not found ────────────────────────────────────────────────────────────────
function NotFound() {
  return (
    <div className="text-center py-24 px-4">
      <p className="text-6xl mb-4">👤</p>
      <h2 className="text-2xl font-black mb-2" style={{ color: 'var(--text)' }}>
        Пользователь не найден
      </h2>
      <p className="mb-8" style={{ color: 'var(--text-muted)' }}>
        Возможно, аккаунт был удалён или ссылка неверна
      </p>
      <button
        onClick={() => window.history.back()}
        className="gv-btn-primary px-6 py-3"
      >
        ← Назад
      </button>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user: me } = useAuth();

  const userId = String(params?.id ?? '');

  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading');

  useEffect(() => {
    if (!userId) return;
    setStatus('loading');
    apiFetch(`${API_BASE}/users/${userId}`)
      .then(async (res) => {
        if (res.status === 404) { setStatus('notfound'); return; }
        if (!res.ok) { setStatus('error'); return; }
        const data = await res.json();
        // Деструктурируем только публичные поля, намеренно отбрасывая приватные
        const { id, username, city, bio, interests } = data;
        setProfile({ id, username, city: city ?? null, bio: bio ?? null, interests: interests ?? null });
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [userId]);

  const isOwnProfile = me && profile && me.id === profile.id;
  const initials = profile?.username?.slice(0, 2).toUpperCase() ?? '?';
  const interests = parseInterests(profile?.interests ?? null);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      <main className="container mx-auto px-4 py-10 max-w-3xl">

        {/* ── Back navigation ── */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm font-semibold mb-6 transition hover:opacity-70"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Назад
        </button>

        {/* ── States ── */}
        {status === 'loading' && <ProfileSkeleton />}
        {status === 'notfound' && <NotFound />}
        {status === 'error' && (
          <div className="text-center py-24">
            <p className="text-5xl mb-4">⚠️</p>
            <h2 className="text-xl font-black mb-2" style={{ color: 'var(--text)' }}>Ошибка загрузки</h2>
            <p className="mb-6" style={{ color: 'var(--text-muted)' }}>Не удалось получить данные профиля</p>
            <button onClick={() => window.location.reload()} className="gv-btn-primary px-6 py-3">
              Попробовать снова
            </button>
          </div>
        )}

        {status === 'ok' && profile && (
          <div className="space-y-6">

            {/* ── Own-profile notice ── */}
            {isOwnProfile && (
              <div
                className="rounded-2xl px-5 py-3 flex items-center justify-between gap-4"
                style={{
                  background: 'var(--primary-hl)',
                  border: '1px solid color-mix(in oklch, var(--primary) 25%, var(--border))',
                }}
              >
                <p className="text-sm font-semibold" style={{ color: 'var(--primary)' }}>
                  👋 Это ваш публичный профиль
                </p>
                <Link
                  href="/profile"
                  className="text-sm font-bold px-4 py-1.5 rounded-full transition hover:opacity-90"
                  style={{ background: 'var(--primary)', color: '#fff' }}
                >
                  ✏️ Редактировать
                </Link>
              </div>
            )}

            {/* ── Avatar + main info card ── */}
            <div
              className="rounded-3xl p-8"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">

                {/* Avatar */}
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-black shadow-lg shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, var(--primary) 0%, #a855f7 100%)',
                    color: '#fff',
                  }}
                >
                  {initials}
                </div>

                {/* Info */}
                <div className="flex-1 text-center sm:text-left">
                  <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>
                    {profile.username}
                  </h1>

                  {/* Badges row */}
                  <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                    {profile.city && (
                      <span
                        className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-full"
                        style={{
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        📍 {profile.city}
                      </span>
                    )}
                  </div>

                  {/* Bio */}
                  {profile.bio && (
                    <p
                      className="text-sm mt-4 leading-relaxed max-w-md"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {profile.bio}
                    </p>
                  )}

                  {/* Interests */}
                  {interests.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-4">
                      {interests.map((interest) => (
                        <span
                          key={interest}
                          className="text-xs px-2.5 py-1 rounded-full font-medium"
                          style={{
                            background: 'var(--badge-bg, #eef2ff)',
                            color: 'var(--accent, #4f46e5)',
                          }}
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Empty state for bio/interests */}
                  {!profile.bio && interests.length === 0 && (
                    <p className="text-sm mt-4 italic" style={{ color: 'var(--text-faint)' }}>
                      Пользователь пока не заполнил профиль
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Footer link to events ── */}
            <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
              Хотите найти компанию на событие?{' '}
              <Link href="/events" className="font-medium transition" style={{ color: 'var(--primary)' }}>
                Смотреть события →
              </Link>
            </p>

          </div>
        )}
      </main>
    </div>
  );
}
