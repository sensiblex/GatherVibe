'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import Navbar from '../components/Navbar';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface User {
  id: number;
  username: string;
  email: string;
  city?: string;
  interests?: string;
  is_active: boolean;
}

const STATS = [
  { label: 'Создано групп',          value: '0', emoji: '👥' },
  { label: 'Посещено мероприятий',   value: '0', emoji: '🎭' },
  { label: 'Найдено компаний',       value: '0', emoji: '✨' },
];

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }

    axios.get(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => setUser(res.data))
      .catch(err => {
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          router.push('/login');
        } else {
          setError('Не удалось загрузить профиль');
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  const handleLogout = () => {
    ['token', 'user_id', 'username', 'email'].forEach(k => localStorage.removeItem(k));
    router.push('/');
  };

  /* ── Loading ── */
  if (loading) return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="container mx-auto px-4 py-16 max-w-4xl animate-pulse">
        <div className="rounded-3xl p-8 mb-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex gap-6 items-center">
            <div className="w-24 h-24 rounded-full" style={{ background: 'var(--surface-2)' }} />
            <div className="space-y-3 flex-1">
              <div className="h-6 rounded w-1/3" style={{ background: 'var(--surface-2)' }} />
              <div className="h-4 rounded w-1/2" style={{ background: 'var(--surface-2)' }} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 rounded-2xl"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
          ))}
        </div>
      </div>
    </div>
  );

  /* ── Error ── */
  if (error) return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <span className="text-5xl">😕</span>
        <p style={{ color: 'var(--error)' }}>{error}</p>
        <button
          onClick={() => router.push('/')}
          className="gv-btn-primary"
        >
          На главную
        </button>
      </div>
    </div>
  );

  const initials = user?.username?.slice(0, 2).toUpperCase() || 'U';

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      <main className="container mx-auto px-4 py-10 max-w-4xl">

        {/* ── Аватар + имя ── */}
        <div
          className="rounded-3xl p-8 mb-6"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Аватар */}
            <div className="relative shrink-0">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-black shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, var(--primary) 0%, #a855f7 100%)',
                  color: '#fff',
                }}
              >
                {initials}
              </div>
              {user?.is_active && (
                <span
                  className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2"
                  style={{
                    background: 'var(--success)',
                    borderColor: 'var(--surface)',
                  }}
                />
              )}
            </div>

            {/* Инфо */}
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>
                {user?.username}
              </h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {user?.email}
              </p>

              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4">
                {user?.city && (
                  <span
                    className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-full"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    📍 {user.city}
                  </span>
                )}
                <span
                  className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-full font-medium"
                  style={{
                    background: user?.is_active ? 'var(--success-hl)' : 'var(--error-hl)',
                    color: user?.is_active ? 'var(--success)' : 'var(--error)',
                    border: `1px solid ${user?.is_active ? 'var(--success-hl)' : 'var(--error-hl)'}`,
                  }}
                >
                  {user?.is_active ? '✓ Активен' : 'Заблокирован'}
                </span>
                <span
                  className="text-sm px-3 py-1 rounded-full font-mono"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-faint)',
                  }}
                >
                  ID: {user?.id}
                </span>
              </div>

              {user?.interests && (
                <p className="text-sm mt-3 max-w-md" style={{ color: 'var(--text-muted)' }}>
                  🎯 {user.interests}
                </p>
              )}
            </div>

            {/* Выйти */}
            <button
              onClick={handleLogout}
              className="shrink-0 text-sm px-4 py-2 rounded-xl font-medium transition"
              style={{
                background: 'var(--error-hl)',
                color: 'var(--error)',
                border: '1px solid var(--error-hl)',
              }}
            >
              Выйти
            </button>
          </div>
        </div>

        {/* ── Статистика ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {STATS.map(s => (
            <div
              key={s.label}
              className="rounded-2xl p-6 text-center"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              <span className="text-3xl">{s.emoji}</span>
              <p className="text-3xl font-black mt-2" style={{ color: 'var(--text)' }}>{s.value}</p>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Действия ── */}
        <div
          className="rounded-3xl p-6"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text)' }}>Настройки</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition"
              style={{ background: 'var(--primary)', color: 'var(--text-inverse)' }}
            >
              ✏️ Редактировать профиль
            </button>
            <button
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition"
              style={{
                background: 'var(--primary-hl)',
                color: 'var(--primary)',
                border: '1px solid var(--border)',
              }}
            >
              🔒 Сменить пароль
            </button>
            <button
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition"
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              🔐 Приватность
            </button>
          </div>
        </div>

        <p className="text-center text-sm mt-8" style={{ color: 'var(--text-muted)' }}>
          Хочешь посмотреть события?{' '}
          <Link href="/events" className="font-medium transition" style={{ color: 'var(--primary)' }}>
            Перейти →
          </Link>
        </p>
      </main>
    </div>
  );
}
