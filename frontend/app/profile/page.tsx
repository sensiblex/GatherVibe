'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import Navbar from '../components/Navbar';

interface User {
  id: number;
  username: string;
  email: string;
  city?: string;
  interests?: string;
  is_active: boolean;
}

const STATS = [
  { label: 'Создано групп', value: '0', emoji: '👥' },
  { label: 'Посещено мероприятий', value: '0', emoji: '🎭' },
  { label: 'Найдено компаний', value: '0', emoji: '✨' },
];

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }

    axios.get('http://localhost:8000/users/me', {
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
  }, []);

  const handleLogout = () => {
    ['token', 'user_id', 'username', 'email'].forEach(k => localStorage.removeItem(k));
    router.push('/');
  };

  /* ─ Loading ─ */
  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="container mx-auto px-4 py-16 max-w-4xl animate-pulse">
        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm mb-6">
          <div className="flex gap-6 items-center">
            <div className="w-24 h-24 rounded-full bg-gray-200" />
            <div className="space-y-3 flex-1">
              <div className="h-6 bg-gray-200 rounded w-1/3" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map(i=><div key={i} className="h-24 bg-white rounded-2xl border border-gray-100" />)}
        </div>
      </div>
    </div>
  );

  /* ─ Error ─ */
  if (error) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <span className="text-5xl">😕</span>
        <p className="text-red-500">{error}</p>
        <button onClick={() => router.push('/')}
          className="bg-indigo-600 text-white px-6 py-2 rounded-xl hover:bg-indigo-700 transition">
          На главную
        </button>
      </div>
    </div>
  );

  const initials = user?.username?.slice(0, 2).toUpperCase() || 'U';

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="container mx-auto px-4 py-10 max-w-4xl">

        {/* ── Аватар + имя ── */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 mb-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Аватар */}
            <div className="relative shrink-0">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-3xl font-black shadow-lg">
                {initials}
              </div>
              {user?.is_active && (
                <span className="absolute bottom-1 right-1 w-4 h-4 bg-emerald-400 border-2 border-white rounded-full" />
              )}
            </div>

            {/* Инфо */}
            <div className="flex-1 text-center sm:text-left">
              <h1 className="text-2xl font-black text-gray-900">{user?.username}</h1>
              <p className="text-gray-400 text-sm mt-0.5">{user?.email}</p>

              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4">
                {user?.city && (
                  <span className="flex items-center gap-1.5 text-sm bg-gray-50 border border-gray-100 text-gray-600 px-3 py-1 rounded-full">
                    📍 {user.city}
                  </span>
                )}
                <span className={`flex items-center gap-1.5 text-sm px-3 py-1 rounded-full font-medium ${
                  user?.is_active
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    : 'bg-red-50 text-red-600 border border-red-100'
                }`}>
                  {user?.is_active ? '✓ Активен' : 'Заблокирован'}
                </span>
                <span className="text-sm bg-gray-50 border border-gray-100 text-gray-400 px-3 py-1 rounded-full font-mono">
                  ID: {user?.id}
                </span>
              </div>

              {user?.interests && (
                <p className="text-sm text-gray-500 mt-3 max-w-md">🎯 {user.interests}</p>
              )}
            </div>

            {/* Выйти */}
            <button onClick={handleLogout}
              className="shrink-0 text-sm bg-red-50 text-red-600 border border-red-100 px-4 py-2 rounded-xl hover:bg-red-100 transition font-medium">
              Выйти
            </button>
          </div>
        </div>

        {/* ── Статистика ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {STATS.map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
              <span className="text-3xl">{s.emoji}</span>
              <p className="text-3xl font-black text-gray-900 mt-2">{s.value}</p>
              <p className="text-sm text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Действия ── */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-base font-bold text-gray-800 mb-4">Настройки</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button className="flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-semibold hover:opacity-90 shadow-sm shadow-indigo-100 transition">
              ✏️ Редактировать профиль
            </button>
            <button className="flex items-center justify-center gap-2 bg-white border border-indigo-200 text-indigo-600 py-3 rounded-xl font-semibold hover:bg-indigo-50 transition">
              🔒 Сменить пароль
            </button>
            <button className="flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-600 py-3 rounded-xl font-semibold hover:bg-gray-50 transition">
              🔐 Приватность
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-gray-400 mt-8">
          Хочешь посмотреть события?{' '}
          <Link href="/events" className="text-indigo-600 hover:text-indigo-800 font-medium transition">
            Перейти →
          </Link>
        </p>
      </main>
    </div>
  );
}
