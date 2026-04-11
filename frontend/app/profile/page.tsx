'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
async function uploadToImgbb(file: File): Promise<string> {
  if (!IMGBB_KEY) throw new Error('NEXT_PUBLIC_IMGBB_KEY не задан в .env.local');
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: 'POST', body: form });
  const data = await res.json() as { success: boolean; data: { url: string }; error?: { message: string } };
  if (!data.success) throw new Error(data.error?.message || 'Ошибка загрузки изображения');
  return data.data.url;
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
      return (
        <Link key={p.id} href={`/parties/${p.id}`} style={cardStyle} className="hover:opacity-80 transition-opacity">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm line-clamp-1" style={{ color: 'var(--text)' }}>{p.title}</span>
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
          {list.map(ev => (
            <Link key={ev.event_id} href={`/events/${ev.event_id}`}
              className="flex gap-3 rounded-2xl p-3 hover:opacity-80 transition-opacity"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              {ev.image_url ? (
                <img src={ev.image_url} alt={ev.title} className="w-16 h-16 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-xl shrink-0 flex items-center justify-center text-2xl"
                  style={{ background: 'var(--surface)' }}>🎭</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm line-clamp-1" style={{ color: 'var(--text)' }}>{ev.title}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {ev.date_ts
                    ? new Date(ev.date_ts * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
                    : 'Дата не указана'}
                  {ev.city ? ` · ${ev.city}` : ''}
                </p>
                {ev.category && (
                  <span className="inline-block text-[11px] px-2 py-0.5 rounded-full font-medium mt-1"
                    style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}>
                    {ev.category}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser]               = useState<User | null>(null);
  const [stats, setStats]             = useState<UserStats | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [editOpen, setEditOpen]       = useState(false);
  const [passOpen, setPassOpen]       = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [activeTab, setActiveTab]     = useState<'info' | 'parties' | 'events'>('info');
  const [reviewSummary, setReviewSummary] = useState<{
    avg_rating: number | null;
    total_reviews: number;
    reviews: Array<{
      id: number; reviewer_id: number; reviewer_username: string;
      reviewer_avatar_url: string | null; rating: number;
      text: string | null; tags: string[] | null; created_at: string;
    }>;
    stars_distribution: Record<number, number>;
    top_tags: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }

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

  // Fetch reviews once user.id is known
  useEffect(() => {
    if (!user?.id) return;
    apiFetch(`${API_BASE}/users/${user.id}/reviews`)
      .then(r => r.json())
      .then(data => setReviewSummary(data))
      .catch(() => {});
  }, [user?.id]);

  const STATS = [
    { label: 'Создано групп',        value: String(stats?.parties_created ?? 0), emoji: '👥' },
    { label: 'Посещено мероприятий', value: String(stats?.events_attended  ?? 0), emoji: '🎭' },
    { label: 'Найдено компаний',     value: String(stats?.matches_found    ?? 0), emoji: '✨' },
  ];

  const handleLogout = () => {
    ['token', 'user_id', 'username', 'email'].forEach(k => localStorage.removeItem(k));
    router.push('/');
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setAvatarError('Выберите изображение'); return; }
    if (file.size > 5 * 1024 * 1024) { setAvatarError('Файл слишком большой (макс. 5 МБ)'); return; }
    setAvatarLoading(true); setAvatarError('');
    try {
      const url = await uploadToImgbb(file);
      const res = await apiFetch(`${API_BASE}/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: url }),
      });
      if (!res.ok) throw new Error('Не удалось обновить аватар');
      setUser(await res.json() as User);
      localStorage.setItem('avatar_url', url);
      window.dispatchEvent(new Event('avatar:updated'));
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

      <main className="container mx-auto px-4 py-10 max-w-4xl">

        {/* ── Avatar + name card ── */}
        <div className="rounded-3xl p-8 mb-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="relative shrink-0">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.username}
                  className="w-24 h-24 rounded-full object-cover shadow-lg" />
              ) : (
                <div className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-black shadow-lg"
                  style={{ background: 'linear-gradient(135deg, var(--primary) 0%, #a855f7 100%)', color: '#fff' }}>
                  {initials}
                </div>
              )}
              {user?.is_active && (
                <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2"
                  style={{ background: 'var(--success)', borderColor: 'var(--surface)' }} />
              )}
              <button onClick={() => fileInputRef.current?.click()} disabled={avatarLoading}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition hover:opacity-90 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff' }}
                title="Загрузить фото">
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
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={handleAvatarUpload} />
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>{user?.username}</h1>
                <button onClick={() => setEditOpen(true)}
                  className="text-xs px-3 py-1.5 rounded-full font-semibold transition hover:opacity-90 shadow-sm"
                  style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff' }}>
                  ✏️ Редактировать
                </button>
              </div>
              <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
              {avatarError && (
                <p className="text-xs mt-1" style={{ color: 'var(--error)' }}>{avatarError}</p>
              )}
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4">
                {user?.city && (
                  <span className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-full"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    📍 {user.city}
                  </span>
                )}
                <span className="flex items-center gap-1.5 text-sm px-3 py-1 rounded-full font-medium"
                  style={{
                    background: user?.is_active ? 'var(--success-hl)' : 'var(--error-hl)',
                    color: user?.is_active ? 'var(--success)' : 'var(--error)',
                    border: `1px solid ${user?.is_active ? 'var(--success-hl)' : 'var(--error-hl)'}`,
                  }}>
                  {user?.is_active ? '✓ Активен' : 'Заблокирован'}
                </span>
                <span className="text-sm px-3 py-1 rounded-full font-mono"
                  style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-faint)' }}>
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
                    <span key={id} className="text-xs px-2.5 py-1 rounded-full font-medium"
                      style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}>
                      {getInterestLabel(id)}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Logout */}
            <button onClick={handleLogout}
              className="shrink-0 text-sm px-4 py-2 rounded-xl font-medium transition"
              style={{ background: 'var(--error-hl)', color: 'var(--error)', border: '1px solid var(--error-hl)' }}>
              Выйти
            </button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {stats === null ? (
            [1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl p-6 animate-pulse"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <div className="w-8 h-8 rounded-full mx-auto mb-2" style={{ background: 'var(--surface-2)' }} />
                <div className="h-8 rounded w-1/3 mx-auto mb-1" style={{ background: 'var(--surface-2)' }} />
                <div className="h-3 rounded w-2/3 mx-auto" style={{ background: 'var(--surface-2)' }} />
              </div>
            ))
          ) : (
            STATS.map(s => (
              <div key={s.label} className="rounded-2xl p-6 text-center"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                <span className="text-3xl">{s.emoji}</span>
                <p className="text-3xl font-black mt-2" style={{ color: 'var(--text)' }}>{s.value}</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              </div>
            ))
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-2 mb-2 flex-wrap">
          {(['info', 'parties', 'events'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition"
              style={{
                background: activeTab === tab ? 'var(--primary)' : 'var(--surface)',
                color: activeTab === tab ? 'var(--text-inverse)' : 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}>
              {tab === 'info' ? '👤 Профиль' : tab === 'parties' ? '👥 Мои компании' : '🎭 Мои события'}
            </button>
          ))}
        </div>

        {activeTab !== 'info' && (
          <div className="rounded-3xl p-6 mb-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            {activeTab === 'parties' && user && <MyPartiesTab userId={user.id} />}
            {activeTab === 'events' && <MyEventsTab />}
          </div>
        )}

        {/* ── Reviews (info tab only) ── */}
        {activeTab === 'info' && (
          <div className="rounded-3xl p-6 mb-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Отзывы обо мне</h2>
              {user && (
                <Link href={`/users/${user.id}`} className="text-xs font-medium transition hover:opacity-70"
                  style={{ color: 'var(--primary)' }}>
                  Публичный профиль →
                </Link>
              )}
            </div>
            {!reviewSummary || reviewSummary.total_reviews === 0 ? (
              <div className="text-center py-6">
                <p className="text-3xl mb-2">💬</p>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Отзывов пока нет</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-faint, #aaa)' }}>
                  Они появятся после совместных событий
                </p>
              </div>
            ) : (
              <>
                {/* Summary row */}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-3xl font-black" style={{ color: 'var(--primary)' }}>
                    {reviewSummary.avg_rating?.toFixed(1)}
                  </span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(star => (
                      <svg key={star} width="16" height="16" viewBox="0 0 24 24"
                        fill={star <= Math.round(reviewSummary.avg_rating ?? 0) ? '#f59e0b' : 'none'}
                        stroke={star <= Math.round(reviewSummary.avg_rating ?? 0) ? '#f59e0b' : '#9ca3af'}
                        strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    ))}
                  </div>
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {reviewSummary.total_reviews} отзыв{reviewSummary.total_reviews === 1 ? '' : reviewSummary.total_reviews < 5 ? 'а' : 'ов'}
                  </span>
                </div>
                {/* Top tags */}
                {reviewSummary.top_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {reviewSummary.top_tags.map(tag => (
                      <span key={tag} className="text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{ background: 'var(--primary-hl)', color: 'var(--primary)' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {/* Recent reviews */}
                <div className="space-y-2">
                  {reviewSummary.reviews.slice(0, 3).map(review => (
                    <div key={review.id} className="rounded-2xl p-3"
                      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center gap-2">
                        <Link href={`/users/${review.reviewer_id}`}
                          className="text-sm font-bold hover:opacity-70 transition"
                          style={{ color: 'var(--primary)' }}>
                          {review.reviewer_username}
                        </Link>
                        <div className="flex gap-0.5 ml-auto">
                          {[1, 2, 3, 4, 5].map(star => (
                            <svg key={star} width="12" height="12" viewBox="0 0 24 24"
                              fill={star <= review.rating ? '#f59e0b' : 'none'}
                              stroke={star <= review.rating ? '#f59e0b' : '#9ca3af'}
                              strokeWidth="2">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                          ))}
                        </div>
                      </div>
                      {review.tags && review.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {review.tags.map(tag => (
                            <span key={tag} className="text-[11px] px-1.5 py-0.5 rounded-full"
                              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {review.text && (
                        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{review.text}</p>
                      )}
                    </div>
                  ))}
                </div>
                {reviewSummary.total_reviews > 3 && user && (
                  <Link href={`/users/${user.id}`}
                    className="block text-center text-xs mt-3 font-medium transition hover:opacity-70"
                    style={{ color: 'var(--primary)' }}>
                    Смотреть все {reviewSummary.total_reviews} →
                  </Link>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Settings (info tab only) ── */}
        {activeTab === 'info' && (
          <>
            <div className="rounded-3xl p-6"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
              <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text)' }}>Настройки</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button onClick={() => setEditOpen(true)}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition hover:opacity-90"
                  style={{ background: 'var(--accent, #4f46e5)', color: '#fff' }}>
                  ✏️ Редактировать профиль
                </button>
                <button onClick={() => setPassOpen(true)}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition hover:opacity-80"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  🔒 Сменить пароль
                </button>
                <button onClick={() => setPrivacyOpen(true)}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition hover:opacity-80"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
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
