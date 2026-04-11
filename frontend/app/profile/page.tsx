'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';
import { apiFetch } from '../lib/apiFetch';
import Navbar from '../components/Navbar';
import { INTERESTS_LIST, getInterestLabel } from '../lib/interests';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const IMGBB_KEY = process.env.NEXT_PUBLIC_IMGBB_KEY || '';

interface User {
  id: number;
  username: string;
  email: string;
  city?: string;
  bio?: string;
  interests?: string;
  avatar_url?: string;
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

  const toggleInterest = (id: string) => {
    setSelectedInterests(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
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

          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Имя</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

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

          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>
              Интересы
            </label>
            <div className="flex flex-wrap gap-2">
              {INTERESTS_LIST.map(({ id, label }) => {
                const active = selectedInterests.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleInterest(id)}
                    className="text-sm px-3 py-1.5 rounded-full font-medium transition hover:opacity-80"
                    style={{
                      background: active ? 'var(--primary-hl)' : 'var(--surface-2)',
                      color: active ? 'var(--primary)' : 'var(--text-muted)',
                      border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

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
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
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
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPassword, setOldPassword]     = useState('');
  const [newPassword, setNewPassword]     = useState('');
  const [confirmPass, setConfirmPass]     = useState('');
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [success, setSuccess]             = useState(false);

  const handleSave = async () => {
    if (!oldPassword || !newPassword || !confirmPass) {
      setError('Заполните все поля'); return;
    }
    if (newPassword !== confirmPass) {
      setError('Пароли не совпадают'); return;
    }
    if (newPassword.length < 6) {
      setError('Новый пароль должен быть не менее 6 символов'); return;
    }
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      await axios.patch(
        `${API_BASE}/users/me`,
        { old_password: oldPassword, new_password: newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(true);
      setTimeout(onClose, 1200);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.detail || 'Не удалось сменить пароль');
      } else {
        setError('Не удалось сменить пароль');
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
        className="w-full max-w-sm rounded-3xl shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="px-6 pt-6 pb-2 flex items-center justify-between">
          <h2 className="text-lg font-black" style={{ color: 'var(--text)' }}>🔒 Сменить пароль</h2>
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
          {success && (
            <p
              className="text-sm px-4 py-2 rounded-xl"
              style={{
                background: 'color-mix(in oklch, #22c55e 10%, transparent)',
                color: '#22c55e',
                border: '1px solid color-mix(in oklch, #22c55e 30%, transparent)',
              }}
            >
              Пароль успешно изменён!
            </p>
          )}

          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
              Текущий пароль
            </label>
            <input
              type="password"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
              Новый пароль
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
              Подтвердите пароль
            </label>
            <input
              type="password"
              value={confirmPass}
              onChange={e => setConfirmPass(e.target.value)}
              placeholder="Повторите новый пароль"
              className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={loading || success}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white hover:opacity-90 transition disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}
            >
              {loading ? 'Сохранение...' : 'Сменить пароль'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm transition hover:opacity-80"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
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
async function uploadToImgbb(file: File): Promise<string> {
  if (!IMGBB_KEY) throw new Error('NEXT_PUBLIC_IMGBB_KEY не задан в .env.local');
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message || 'Ошибка загрузки изображения');
  return data.data.url as string;
}

// ──────────────────────────────────────────────────────────────────
type MemberStatus = 'pending' | 'accepted' | 'rejected' | 'left';

interface PartyMemberOut {
  user_id: number;
  username: string;
  status: MemberStatus;
  joined_at: string;
}

interface PartyOut {
  id: number;
  event_id: string;
  title: string;
  description: string | null;
  max_members: number;
  creator_id: number;
  creator_username: string;
  is_open: boolean;
  members: PartyMemberOut[];
  created_at: string;
}

function MyPartiesTab({ userId }: { userId: number }) {
  const [parties, setParties]   = useState<PartyOut[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    apiFetch(`${API_BASE}/users/me/parties`)
      .then(r => r.json())
      .then((data: PartyOut[]) => setParties(Array.isArray(data) ? data : []))
      .catch(() => setParties([]))
      .finally(() => setLoading(false));
  }, []);

  const created  = parties.filter(p => p.creator_id === userId);
  const memberOf = parties.filter(p => p.creator_id !== userId);

  const cardStyle: React.CSSProperties = {
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: '1rem',
    padding: '1rem 1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  };

  const renderList = (list: PartyOut[]) =>
    list.map(p => {
      const accepted = p.members.filter(m => m.status === 'accepted').length;
      return (
        <Link key={p.id} href={`/parties/${p.id}`} style={cardStyle}
          className="hover:opacity-80 transition-opacity">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm line-clamp-1" style={{ color: 'var(--text)' }}>
              {p.title}
            </span>
            <span
              className="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0"
              style={p.is_open
                ? { background: 'var(--success-hl)', color: 'var(--success)' }
                : { background: 'var(--surface)', color: 'var(--text-faint)', border: '1px solid var(--border)' }}
            >
              {p.is_open ? 'Открыта' : 'Закрыта'}
            </span>
          </div>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {accepted + 1}/{p.max_members} участников · Событие #{p.event_id}
          </span>
        </Link>
      );
    });

  if (loading) return (
    <div className="space-y-2 animate-pulse">
      {[1,2,3].map(i => <div key={i} className="h-14 rounded-2xl" style={{ background: 'var(--surface-2)' }} />)}
    </div>
  );

  if (parties.length === 0) return (
    <div className="text-center py-10">
      <p className="text-4xl mb-3">👥</p>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Вы пока не состоите ни в одной компании</p>
      <Link href="/events" className="mt-3 inline-block text-sm font-medium" style={{ color: 'var(--primary)' }}>
        Найти события →
      </Link>
    </div>
  );

  return (
    <div className="space-y-5">
      {created.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-faint)' }}>
            Созданные мной ({created.length})
          </p>
          <div className="space-y-2">{renderList(created)}</div>
        </div>
      )}
      {memberOf.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--text-faint)' }}>
            Участник ({memberOf.length})
          </p>
          <div className="space-y-2">{renderList(memberOf)}</div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser]               = useState<User | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [editOpen, setEditOpen]       = useState(false);
  const [passOpen, setPassOpen]       = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [activeTab, setActiveTab]     = useState<'info' | 'parties'>('info');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAvatarError('Выберите изображение'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Файл слишком большой (макс. 5 МБ)'); return;
    }
    setAvatarLoading(true);
    setAvatarError('');
    try {
      const url = await uploadToImgbb(file);
      const token = localStorage.getItem('token');
      const res = await axios.patch(
        `${API_BASE}/users/me`,
        { avatar_url: url },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUser(res.data);
      // Синхронизируем с localStorage для Navbar
      localStorage.setItem('avatar_url', url);
      window.dispatchEvent(new Event('avatar:updated'));
    } catch (err: unknown) {
      if (err instanceof Error) {
        setAvatarError(err.message);
      } else {
        setAvatarError('Не удалось загрузить фото');
      }
    }
    setAvatarLoading(false);
    // Сбрасываем input, чтобы можно было выбрать тот же файл повторно
    if (fileInputRef.current) fileInputRef.current.value = '';
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
  const interestIds = user?.interests
    ? user.interests.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      {/* Modals */}
      {editOpen && user && (
        <EditProfileModal
          user={user}
          onSave={updated => { setUser(updated); setEditOpen(false); }}
          onClose={() => setEditOpen(false)}
        />
      )}
      {passOpen && (
        <ChangePasswordModal onClose={() => setPassOpen(false)} />
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
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.username}
                  className="w-24 h-24 rounded-full object-cover shadow-lg"
                />
              ) : (
                <div
                  className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-black shadow-lg"
                  style={{ background: 'linear-gradient(135deg, var(--primary) 0%, #a855f7 100%)', color: '#fff' }}
                >
                  {initials}
                </div>
              )}
              {user?.is_active && (
                <span
                  className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2"
                  style={{ background: 'var(--success)', borderColor: 'var(--surface)' }}
                />
              )}
              {/* Кнопка загрузки аватара */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarLoading}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition hover:opacity-90 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff' }}
                title="Загрузить фото"
              >
                {avatarLoading ? (
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>{user?.username}</h1>
                <button
                  onClick={() => setEditOpen(true)}
                  className="text-xs px-3 py-1.5 rounded-full font-semibold transition hover:opacity-90 shadow-sm"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff' }}
                >
                  ✏️ Редактировать
                </button>
              </div>

              <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>

              {avatarError && (
                <p className="text-xs mt-1" style={{ color: 'var(--error)' }}>{avatarError}</p>
              )}

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

              {interestIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {interestIds.map(id => (
                    <span
                      key={id}
                      className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}
                    >
                      {getInterestLabel(id)}
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

        {/* ── Tabs ── */}
        <div className="flex gap-2 mb-2">
          {(['info', 'parties'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition"
              style={{
                background: activeTab === tab ? 'var(--primary)' : 'var(--surface)',
                color: activeTab === tab ? 'var(--text-inverse)' : 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              {tab === 'info' ? '👤 Профиль' : '👥 Мои компании'}
            </button>
          ))}
        </div>

        {/* ── My Parties tab ── */}
        {activeTab === 'parties' && user && (
          <div
            className="rounded-3xl p-6 mb-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
          >
            <MyPartiesTab userId={user.id} />
          </div>
        )}

        {/* ── Settings (shown only on info tab) ── */}
        {activeTab === 'info' && (
          <>
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
                  onClick={() => setPassOpen(true)}
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
          </>
        )}
      </main>
    </div>
  );
}
