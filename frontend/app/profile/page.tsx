'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import Navbar from '../components/Navbar';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Задача 3: 14 интересов
const INTEREST_OPTIONS = [
  'музыка', 'кино', 'театр', 'выставки', 'спорт', 'йога',
  'рок', 'джаз', 'классика', 'фестивали', 'мастер-классы', 'танцы',
  'литература', 'фотография',
];

interface User {
  id: number;
  username: string;
  email: string;
  city?: string;
  bio?: string;
  interests?: string;
  is_active: boolean;
}

const STATS = [
  { label: 'Создано групп',          value: '0', emoji: '👥' },
  { label: 'Посещено мероприятий',   value: '0', emoji: '🎭' },
  { label: 'Найдено компаний',       value: '0', emoji: '✨' },
];

// ──────────────────────────────────────────────────────────────────
function EditProfileModal({
  user,
  onSave,
  onClose,
}: {
  user: User;
  onSave: (updated: User) => void;
  onClose: () => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [city, setCity] = useState(user.city || '');
  const [bio, setBio] = useState(user.bio || '');
  const [selectedInterests, setSelectedInterests] = useState<string[]>(
    user.interests ? user.interests.split(',').map(s => s.trim()).filter(Boolean) : []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const handleSave = async () => {
    if (!username.trim()) { setError('Username не может быть пустым'); return; }
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await axios.patch(
        `${API_BASE}/users/me`,
        {
          username: username.trim(),
          city: city.trim() || null,
          bio: bio.trim() || null,
          interests: selectedInterests.length > 0 ? selectedInterests.join(',') : null,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onSave(res.data);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.detail || 'Не удалось сохранить');
      } else {
        setError('Не удалось сохранить');
      }
    }
    setLoading(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'oklch(0 0 0 / 0.55)' }}
    >
      <div
        className="w-full max-w-md rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-2 flex items-center justify-between">
          <h2 className="text-lg font-black" style={{ color: 'var(--text)' }}>✏️ Редактировать профиль</h2>
          <button
            onClick={onClose}
            className="text-xl hover:opacity-70 transition"
            style={{ color: 'var(--text-muted)' }}
          >✕</button>
        </div>

        <div className="px-6 pb-6 space-y-4 mt-4">
          {error && (
            <p
              className="text-sm px-4 py-2 rounded-xl"
              style={{
                background: 'color-mix(in oklch, #ef4444 10%, transparent)',
                color: '#ef4444',
                border: '1px solid color-mix(in oklch, #ef4444 30%, transparent)',
              }}
            >
              {error}
            </p>
          )}

          {/* Username */}
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Имя</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          {/* City */}
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Город</label>
            <input
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="Казань"
              className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>О себе</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value.slice(0, 200))}
              placeholder="Расскажи о себе..."
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
            <p className="text-xs text-right mt-1" style={{ color: 'var(--text-muted)' }}>
              {bio.length}/200
            </p>
          </div>

          {/* Interests — pill checkboxes */}
          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>
              Интересы
            </label>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map(interest => {
                const active = selectedInterests.includes(interest);
                return (
                  <button
                    key={interest}
                    type="button"
                    onClick={() => toggleInterest(interest)}
                    className="text-sm px-3 py-1.5 rounded-full font-medium transition hover:opacity-80"
                    style={{
                      background: active ? '#e0e7ff' : '#ffffff',
                      color: active ? '#4338ca' : '#6b7280',
                      border: `1px solid ${active ? '#a5b4fc' : '#e5e7eb'}`,
                    }}
                  >
                    {interest}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white hover:opacity-90 transition disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm transition hover:opacity-80"
              style={{ border: '1px solid #e5e7eb', color: '#6b7280' }}
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser]         = useState<User | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    axios
      .get(`${API_BASE}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
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

  // ── skeleton ──
  if (loading) return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="container mx-auto px-4 py-16 max-w-4xl animate-pulse">
        <div
          className="rounded-3xl p-8 mb-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex gap-6 items-center">
            <div className="w-24 h-24 rounded-full" style={{ background: 'var(--surface-2)' }} />
            <div className="space-y-3 flex-1">
              <div className="h-6 rounded w-1/3" style={{ background: 'var(--surface-2)' }} />
              <div className="h-4 rounded w-1/2" style={{ background: 'var(--surface-2)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ── error ──
  if (error) return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <span className="text-5xl">😕</span>
        <p style={{ color: 'var(--error)' }}>{error}</p>
        <button onClick={() => router.push('/')} className="gv-btn-primary">На главную</button>
      </div>
    </div>
  );

  const initials = user?.username?.slice(0, 2).toUpperCase() || 'U';
  const interestsList = user?.interests
    ? user.interests.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      {/* Modal */}
      {editOpen && user && (
        <EditProfileModal
          user={user}
          onSave={updated => { setUser(updated); setEditOpen(false); }}
          onClose={() => setEditOpen(false)}
        />
      )}

      <main className="container mx-auto px-4 py-10 max-w-4xl">

        {/* ── Avatar + name card ── */}
        <div
          className="rounded-3xl p-8 mb-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
        >
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-black shadow-lg"
                style={{ background: 'linear-gradient(135deg, var(--primary) 0%, #a855f7 100%)', color: '#fff' }}
              >
                {initials}
              </div>
              {user?.is_active && (
                <span
                  className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2"
                  style={{ background: 'var(--success)', borderColor: 'var(--surface)' }}
                />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>{user?.username}</h1>
                {/* ── Задача 3: кнопка редактирования в шапке ── */}
                <button
                  onClick={() => setEditOpen(true)}
                  className="text-xs px-3 py-1.5 rounded-full font-semibold transition hover:opacity-90 shadow-sm"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff' }}
                >
                  ✏️ Редактировать
                </button>
              </div>

              <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>

              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4">
                {user?.city && (
                  <span
                    className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-full"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
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
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-faint)' }}
                >
                  ID: {user?.id}
                </span>
              </div>

              {user?.bio && (
                <p className="text-sm mt-3 max-w-md leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {user.bio}
                </p>
              )}

              {interestsList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {interestsList.map(i => (
                    <span
                      key={i}
                      className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ background: 'var(--badge-bg, #eef2ff)', color: 'var(--accent, #4f46e5)' }}
                    >
                      {i}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="shrink-0 text-sm px-4 py-2 rounded-xl font-medium transition"
              style={{ background: 'var(--error-hl)', color: 'var(--error)', border: '1px solid var(--error-hl)' }}
            >
              Выйти
            </button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {STATS.map(s => (
            <div
              key={s.label}
              className="rounded-2xl p-6 text-center"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
            >
              <span className="text-3xl">{s.emoji}</span>
              <p className="text-3xl font-black mt-2" style={{ color: 'var(--text)' }}>{s.value}</p>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Settings ── */}
        <div
          className="rounded-3xl p-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
        >
          <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text)' }}>Настройки</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => setEditOpen(true)}
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition hover:opacity-90"
              style={{ background: 'var(--accent, #4f46e5)', color: '#fff' }}
            >
              ✏️ Редактировать профиль
            </button>
            <button
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition hover:opacity-80"
              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              🔒 Сменить пароль
            </button>
            <button
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition hover:opacity-80"
              style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
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
