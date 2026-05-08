'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../lib/apiFetch';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import UserReviewsBlock from '../components/UserReviewsBlock';
import { INTERESTS_LIST, getInterestLabel } from '../lib/interests';
import { translateCategory } from '../events/utils';
import { capitalizeFirstDisplayChar } from '../lib/text';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function toMediaUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_BASE}${path}`;
}

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

interface UserStats {
  parties_created: number;
  events_attended: number;
  matches_found: number;
}

interface PrivacySettings {
  show_email: boolean;
  show_city: boolean;
  show_interests: boolean;
}

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
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!username.trim()) { setError('Username не может быть пустым'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`${API_BASE}/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          city: city.trim() || null,
          bio: bio.trim() || null,
          interests: selectedInterests.length > 0 ? selectedInterests.join(',') : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || 'Не удалось сохранить');
        return;
      }
      onSave(await res.json());
    } catch {
      setError('Не удалось сохранить');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'oklch(0 0 0 / 0.55)' }}>
      <div className="w-full max-w-md rounded-3xl shadow-2xl overflow-y-auto max-h-[90vh]"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="px-6 pt-6 pb-2 flex items-center justify-between">
          <h2 className="text-lg font-black" style={{ color: 'var(--text)' }}>✏️ Редактировать профиль</h2>
          <button onClick={onClose} className="text-xl hover:opacity-70 transition"
            style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div className="px-6 pb-6 space-y-4 mt-4">
          {error && (
            <p className="text-sm px-4 py-2 rounded-xl" style={{
              background: 'color-mix(in oklch, #ef4444 10%, transparent)',
              color: '#ef4444',
              border: '1px solid color-mix(in oklch, #ef4444 30%, transparent)',
            }}>{error}</p>
          )}
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Имя</label>
            <input value={username} onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Город</label>
            <input value={city} onChange={e => setCity(e.target.value)} placeholder="Казань"
              className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>О себе</label>
            <textarea value={bio} onChange={e => setBio(e.target.value.slice(0, 200))}
              placeholder="Расскажи о себе..." rows={3}
              className="w-full px-4 py-2.5 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <p className="text-xs text-right mt-1" style={{ color: 'var(--text-muted)' }}>{bio.length}/200</p>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Интересы</label>
            <div className="flex flex-wrap gap-2">
              {INTERESTS_LIST.map(({ id, label }) => {
                const active = selectedInterests.includes(id);
                return (
                  <button key={id} type="button" onClick={() => toggleInterest(id)}
                    className="text-sm px-3 py-1.5 rounded-full font-medium transition hover:opacity-80"
                    style={{
                      background: active ? 'var(--primary-hl)' : 'var(--surface-2)',
                      color: active ? 'var(--primary)' : 'var(--text-muted)',
                      border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                    }}>{label}</button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={loading}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white hover:opacity-90 transition disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm transition hover:opacity-80"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Отмена</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState(false);

  const handleSave = async () => {
    if (!oldPassword || !newPassword || !confirmPass) { setError('Заполните все поля'); return; }
    if (newPassword !== confirmPass) { setError('Пароли не совпадают'); return; }
    if (newPassword.length < 6) { setError('Новый пароль должен быть не менее 6 символов'); return; }
    setLoading(true); setError('');
    try {
      const res = await apiFetch(`${API_BASE}/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || 'Не удалось сменить пароль');
      } else {
        setSuccess(true);
        setTimeout(onClose, 1200);
      }
    } catch {
      setError('Не удалось сменить пароль');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'oklch(0 0 0 / 0.55)' }}>
      <div className="w-full max-w-sm rounded-3xl shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="px-6 pt-6 pb-2 flex items-center justify-between">
          <h2 className="text-lg font-black" style={{ color: 'var(--text)' }}>🔒 Сменить пароль</h2>
          <button onClick={onClose} className="text-xl hover:opacity-70 transition"
            style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div className="px-6 pb-6 space-y-4 mt-4">
          {error && (
            <p className="text-sm px-4 py-2 rounded-xl" style={{
              background: 'color-mix(in oklch, #ef4444 10%, transparent)',
              color: '#ef4444', border: '1px solid color-mix(in oklch, #ef4444 30%, transparent)',
            }}>{error}</p>
          )}
          {success && (
            <p className="text-sm px-4 py-2 rounded-xl" style={{
              background: 'color-mix(in oklch, #22c55e 10%, transparent)',
              color: '#22c55e', border: '1px solid color-mix(in oklch, #22c55e 30%, transparent)',
            }}>Пароль успешно изменён!</p>
          )}
          {[
            { label: 'Текущий пароль', val: oldPassword, set: setOldPassword, ph: '••••••••' },
            { label: 'Новый пароль',   val: newPassword, set: setNewPassword, ph: 'Минимум 6 символов' },
            { label: 'Подтвердите пароль', val: confirmPass, set: setConfirmPass, ph: 'Повторите новый пароль' },
          ].map(({ label, val, set, ph }) => (
            <div key={label}>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>{label}</label>
              <input type="password" value={val} onChange={e => set(e.target.value)} placeholder={ph}
                className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={loading || success}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white hover:opacity-90 transition disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
              {loading ? 'Сохранение...' : 'Сменить пароль'}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm transition hover:opacity-80"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Отмена</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
function PrivacyModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<PrivacySettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState(false);

  useEffect(() => {
    apiFetch(`${API_BASE}/users/me`)
      .then(r => r.json())
      .then((data: Record<string, unknown>) => {
        setSettings({
          show_email:     typeof data['show_email']     === 'boolean' ? data['show_email']     : false,
          show_city:      typeof data['show_city']      === 'boolean' ? data['show_city']      : true,
          show_interests: typeof data['show_interests'] === 'boolean' ? data['show_interests'] : true,
        });
      })
      .catch(() => setError('Не удалось загрузить настройки'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true); setError(''); setSuccess(false);
    try {
      const res = await apiFetch(`${API_BASE}/users/me/privacy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const data = await res.json() as { detail?: string };
        setError(data.detail || 'Ошибка сохранения');
      } else {
        setSuccess(true);
        setTimeout(onClose, 1000);
      }
    } catch {
      setError('Не удалось сохранить настройки');
    }
    setSaving(false);
  };

  const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-center justify-between gap-4 py-3"
      style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-sm" style={{ color: 'var(--text)' }}>{label}</span>
      <button type="button" onClick={() => onChange(!value)}
        className="relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0"
        style={{ background: value ? 'var(--primary)' : 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
          style={{ transform: value ? 'translateX(20px)' : 'translateX(0)' }} />
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'oklch(0 0 0 / 0.55)' }}>
      <div className="w-full max-w-sm rounded-3xl shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="px-6 pt-6 pb-2 flex items-center justify-between">
          <h2 className="text-lg font-black" style={{ color: 'var(--text)' }}>🔐 Приватность</h2>
          <button onClick={onClose} className="text-xl hover:opacity-70 transition"
            style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>
        <div className="px-6 pb-6 mt-4">
          {error && (
            <p className="text-sm px-4 py-2 rounded-xl mb-4" style={{
              background: 'color-mix(in oklch, #ef4444 10%, transparent)',
              color: '#ef4444', border: '1px solid color-mix(in oklch, #ef4444 30%, transparent)',
            }}>{error}</p>
          )}
          {success && (
            <p className="text-sm px-4 py-2 rounded-xl mb-4" style={{
              background: 'color-mix(in oklch, #22c55e 10%, transparent)',
              color: '#22c55e', border: '1px solid color-mix(in oklch, #22c55e 30%, transparent)',
            }}>Настройки сохранены!</p>
          )}
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 rounded-xl" style={{ background: 'var(--surface-2)' }} />
              ))}
            </div>
          ) : settings ? (
            <div>
              <Toggle label="Показывать email другим пользователям" value={settings.show_email}
                onChange={v => setSettings(s => s ? { ...s, show_email: v } : s)} />
              <Toggle label="Показывать город" value={settings.show_city}
                onChange={v => setSettings(s => s ? { ...s, show_city: v } : s)} />
              <Toggle label="Показывать интересы" value={settings.show_interests}
                onChange={v => setSettings(s => s ? { ...s, show_interests: v } : s)} />
            </div>
          ) : null}
          <div className="flex gap-2 mt-6">
            <button onClick={handleSave} disabled={saving || loading || success}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white hover:opacity-90 transition disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)' }}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm transition hover:opacity-80"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Отмена</button>
          </div>
        </div>
      </div>
    </div>
  );
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
  const [parties, setParties] = useState<PartyOut[]>([]);
  const [loading, setLoading] = useState(true);

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
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: '1rem', padding: '1rem 1.25rem',
    display: 'flex', flexDirection: 'column', gap: '0.25rem',
  };

  const renderList = (list: PartyOut[]) =>
    list.map(p => {
      const accepted = p.members.filter(m => m.status === 'accepted').length;
      const displayTitle = capitalizeFirstDisplayChar(p.title);
      return (
        <Link key={p.id} href={`/parties/${p.id}`} style={cardStyle} className="hover:opacity-80 transition-opacity">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm line-clamp-1" style={{ color: 'var(--text)' }}>{displayTitle}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0"
              style={p.is_open
                ? { background: 'var(--success-hl)', color: 'var(--success)' }
                : { background: 'var(--surface)', color: 'var(--text-faint)', border: '1px solid var(--border)' }}>
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
      {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-2xl" style={{ background: 'var(--surface-2)' }} />)}
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
interface MyEventItem {
  event_id: string;
  title: string;
  date_ts: number | null;
  city: string | null;
  category: string | null;
  image_url: string | null;
  location: string | null;
  is_looking: boolean;
  comment: string | null;
}

interface MyEventsResponse {
  upcoming: MyEventItem[];
  past: MyEventItem[];
}

function MyEventsTab() {
  const [data, setData]       = useState<MyEventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab]   = useState<'upcoming' | 'past'>('upcoming');

  useEffect(() => {
    apiFetch(`${API_BASE}/users/me/events`)
      .then(r => r.json())
      .then((d: MyEventsResponse) => setData(d))
      .catch(() => setData({ upcoming: [], past: [] }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-24 rounded-2xl" style={{ background: 'var(--surface-2)' }} />
      ))}
    </div>
  );

  const list = subTab === 'upcoming' ? (data?.upcoming ?? []) : (data?.past ?? []);

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(['upcoming', 'past'] as const).map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold transition"
            style={{
              background: subTab === t ? 'var(--primary-hl)' : 'var(--surface-2)',
              color: subTab === t ? 'var(--primary)' : 'var(--text-muted)',
              border: `1px solid ${subTab === t ? 'var(--primary)' : 'var(--border)'}`,
            }}>
            {t === 'upcoming' ? '📅 Предстоящие' : '🕰 Прошедшие'}
            {data && (
              <span className="ml-1.5 opacity-70">
                ({t === 'upcoming' ? data.upcoming.length : data.past.length})
              </span>
            )}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-4xl mb-3">{subTab === 'upcoming' ? '📅' : '🕰'}</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {subTab === 'upcoming' ? 'Нет предстоящих событий' : 'Нет прошедших событий'}
          </p>
          <Link href="/events" className="mt-3 inline-block text-sm font-medium" style={{ color: 'var(--primary)' }}>
            Найти события →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(ev => {
            const displayTitle = capitalizeFirstDisplayChar(ev.title);
            return (
              <Link key={ev.event_id} href={`/events/${ev.event_id}`}
                className="flex gap-3 rounded-2xl p-3 hover:opacity-80 transition-opacity"
                style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                {ev.image_url ? (
                  <img src={ev.image_url} alt={displayTitle} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-16 h-16 rounded-xl shrink-0 flex items-center justify-center text-2xl"
                    style={{ background: 'var(--surface)' }}>🎭</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm line-clamp-1" style={{ color: 'var(--text)' }}>{displayTitle}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {ev.date_ts
                      ? new Date(ev.date_ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
                      : 'Дата не указана'}
                    {ev.city ? ` · ${ev.city}` : ''}
                  </p>
                  {ev.category && (
                    <span className="inline-block text-[11px] px-2 py-0.5 rounded-full font-medium mt-1"
                      style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}>
                      {translateCategory(ev.category)}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();
  const { logout } = useAuth();
  const [user, setUser]               = useState<User | null>(null);
  const [stats, setStats]             = useState<UserStats | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [editOpen, setEditOpen]       = useState(false);
  const [passOpen, setPassOpen]       = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [activeTab, setActiveTab]     = useState<'parties' | 'events'>('parties');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // middleware редиректит аноним на /login; apiFetch при 401 тоже редиректит.
    apiFetch(`${API_BASE}/users/me`)
      .then(async res => {
        if (res.status === 401) {
          localStorage.removeItem('token');
          router.push('/login');
          return;
        }
        if (!res.ok) { setError('Не удалось загрузить профиль'); return; }
        setUser(await res.json() as User);
      })
      .catch(() => setError('Не удалось загрузить профиль'))
      .finally(() => setLoading(false));

    apiFetch(`${API_BASE}/users/me/stats`)
      .then(r => r.json())
      .then((data: UserStats) => setStats(data))
      .catch(() => {});
  }, [router]);

  const STATS = [
    { label: 'Создано групп',        value: String(stats?.parties_created ?? 0), emoji: '👥' },
    { label: 'Посещено мероприятий', value: String(stats?.events_attended  ?? 0), emoji: '🎭' },
    { label: 'Найдено компаний',     value: String(stats?.matches_found    ?? 0), emoji: '✨' },
  ];

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setAvatarError('Выберите изображение'); return; }
    if (file.size > 5 * 1024 * 1024) { setAvatarError('Файл слишком большой (макс. 5 МБ)'); return; }
    setAvatarLoading(true); setAvatarError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetch(`${API_BASE}/users/me/avatar`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Не удалось обновить аватар');
      const data = await res.json() as { avatar_url: string };
      setUser(prev => prev ? { ...prev, avatar_url: data.avatar_url } : prev);
      localStorage.setItem('avatar_url', data.avatar_url);
      window.dispatchEvent(new Event('avatar:updated'));
      router.refresh();
    } catch (err: unknown) {
      setAvatarError(err instanceof Error ? err.message : 'Не удалось загрузить фото');
    }
    setAvatarLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
      </div>
    </div>
  );

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

      {editOpen && user && (
        <EditProfileModal user={user}
          onSave={updated => { setUser(updated); setEditOpen(false); }}
          onClose={() => setEditOpen(false)} />
      )}
      {passOpen && <ChangePasswordModal onClose={() => setPassOpen(false)} />}
      {privacyOpen && <PrivacyModal onClose={() => setPrivacyOpen(false)} />}

      <section className="profile-section" style={{ borderTop: 'none' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px', marginBottom: 48 }}>
          <div className="t-label" style={{ marginBottom: 8 }}>Профиль</div>
          <h1 className="t-display">Ваш аккаунт</h1>
        </div>

      <div className="profile-grid">
      <main>

        {/* ── Profile head ── */}
        <div className="profile-head">
          <div style={{ position: 'relative' }}>
            {user?.avatar_url ? (
              <img src={toMediaUrl(user.avatar_url) || undefined} alt={user.username}
                style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div className="av av-xl">{initials}</div>
            )}
            {user?.is_active && (
              <div className="online" style={{ position: 'absolute', bottom: 3, right: 3, width: 13, height: 13, borderWidth: 2.5, borderStyle: 'solid', borderColor: 'var(--bg)' }} />
            )}
            <button onClick={() => fileInputRef.current?.click()} disabled={avatarLoading}
              className="icon-btn"
              style={{ position: 'absolute', bottom: -6, right: -6, width: 30, height: 30, borderRadius: '50%', background: 'var(--ink)', color: '#fff', border: 'none' }}
              title="Загрузить фото">
              {avatarLoading ? '…' : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="profile-name">{user?.username}</div>
            {user?.city && (
              <div className="profile-loc">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                {user.city}
              </div>
            )}
            <p className="t-sm" style={{ marginBottom: 10 }}>{user?.email}</p>
            {avatarError && <p className="t-xs" style={{ color: 'var(--match)' }}>{avatarError}</p>}
            {interestIds.length > 0 && (
              <div className="tags-wrap">
                {interestIds.map(id => (
                  <span key={id} className="tag">{getInterestLabel(id)}</span>
                ))}
              </div>
            )}

            <div className="profile-about-inline">
              <div className="profile-about-title">О себе</div>
              <p className="t-sm" style={{ lineHeight: 1.62, margin: 0 }}>
                {user?.bio || 'Пока не рассказал о себе. Нажмите «Редактировать», чтобы добавить описание.'}
              </p>
            </div>
          </div>

          <div className="profile-actions">
            <button onClick={() => setEditOpen(true)} className="btn btn-ink btn-sm profile-action-btn">Редактировать</button>
            <button onClick={() => setPassOpen(true)} className="btn btn-ghost btn-sm profile-action-btn">Сменить пароль</button>
            <button onClick={() => setPrivacyOpen(true)} className="btn btn-ghost btn-sm profile-action-btn">Приватность</button>
            <button
              type="button"
              className="btn btn-ghost btn-sm profile-action-btn"
              data-testid="export-data"
              onClick={async () => {
                const r = await apiFetch('/users/me/export');
                if (!r.ok) return;
                const data = await r.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `gathervibe-export-${data.profile?.id}-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Экспорт данных
            </button>
            <button onClick={handleLogout} className="btn btn-ghost btn-sm profile-action-btn profile-action-danger">Выйти</button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="stats-row">
          {stats === null ? (
            [1, 2, 3].map(i => (
              <div key={i} className="stat-box skel" style={{ height: 92 }} />
            ))
          ) : (
            STATS.map(s => (
              <div key={s.label} className="stat-box">
                <div className="stat-num">{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="tab-row" role="tablist">
          {(['parties', 'events'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`tab${activeTab === tab ? ' active' : ''}`} role="tab"
              aria-selected={activeTab === tab}>
              {tab === 'parties' ? 'Мои компании' : 'Мои события'}
            </button>
          ))}
        </div>

        <div className="p-card">
          {activeTab === 'parties' && user && <MyPartiesTab userId={user.id} />}
          {activeTab === 'events' && <MyEventsTab />}
        </div>

        {user && (
          <div className="p-card">
            <div className="p-card-title">Отзывы</div>
            <UserReviewsBlock userId={user.id} viewerUserId={user.id} maxReviews={3} />
          </div>
        )}
      </main>
      </div>
      </section>
    </div>
  );
}
