'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../../../../components/Navbar';
import { useAuth } from '../../../../context/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function parseErrorDetail(detail: unknown): string {
  if (!detail) return 'Ошибка создания';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        if (typeof e === 'object' && e !== null) {
          const loc = (e as Record<string, unknown>).loc;
          const msg = (e as Record<string, unknown>).msg;
          const locStr = Array.isArray(loc) ? loc.join(' → ') : '';
          return locStr ? `${locStr}: ${msg}` : String(msg ?? JSON.stringify(e));
        }
        return String(e);
      })
      .join('; ');
  }
  return JSON.stringify(detail);
}

export default function CreatePartyPage() {
  const params  = useParams();
  const router  = useRouter();
  const eventId = params?.id as string;
  const { token } = useAuth();

  const [form, setForm]         = useState({ title: '', description: '', max_members: 4 });
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (token === null) {
      router.replace('/login');
    }
  }, [token, router]);

  const handleCreate = async () => {
    if (!token) return;
    if (!form.title.trim()) { setError('Название обязательно'); return; }
    setCreating(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/parties/event/${eventId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          max_members: form.max_members,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(parseErrorDetail(data.detail));
        setCreating(false);
        return;
      }
      router.push(`/events/${eventId}`);
    } catch {
      setError('Ошибка сети');
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <main className="container mx-auto px-4 py-10 max-w-lg">
        <nav className="flex items-center gap-2 text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          <Link href="/events" className="transition hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
            События
          </Link>
          <span>/</span>
          <Link href={`/events/${eventId}`} className="transition hover:opacity-80" style={{ color: 'var(--text-muted)' }}>
            Мероприятие
          </Link>
          <span>/</span>
          <span style={{ color: 'var(--text)' }}>Создать компанию</span>
        </nav>

        <div
          className="rounded-3xl overflow-hidden"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {/* Header */}
          <div className="px-8 py-6 bg-gradient-to-r from-purple-600 to-pink-600">
            <div className="flex items-center gap-3">
              <span className="text-4xl">🎉</span>
              <div>
                <h1 className="text-xl font-black text-white">Создать компанию</h1>
                <p className="text-purple-200 text-sm mt-0.5">Найди единомышленников для похода</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="px-8 py-6 flex flex-col gap-5">
            {error && (
              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: 'var(--error-hl)',
                  border: '1px solid color-mix(in oklch, var(--error) 30%, transparent)',
                  color: 'var(--error)',
                }}
              >
                {error}
              </div>
            )}

            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-xs font-bold uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}
              >
                Название компании *
              </label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value.slice(0, 60) }))}
                placeholder="Например: Приятная компания на вечер"
                className="gv-input"
              />
              <span className="text-xs text-right" style={{ color: 'var(--text-faint)' }}>
                {form.title.length}/60
              </span>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-xs font-bold uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}
              >
                Описание
              </label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value.slice(0, 300) }))}
                placeholder="Кого ищешь, планы на вечер, пожелания..."
                rows={4}
                className="gv-input resize-none"
              />
              <span className="text-xs text-right" style={{ color: 'var(--text-faint)' }}>
                {form.description.length}/300
              </span>
            </div>

            {/* Max members */}
            <div className="flex flex-col gap-1.5">
              <label
                className="text-xs font-bold uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}
              >
                Макс. количество участников
              </label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, max_members: Math.max(2, f.max_members - 1) }))}
                  className="w-10 h-10 rounded-full font-bold text-lg transition hover:opacity-80"
                  style={{
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    background: 'var(--surface-2)',
                  }}
                >
                  −
                </button>
                <span
                  className="text-2xl font-black w-8 text-center"
                  style={{ color: 'var(--text)' }}
                >
                  {form.max_members}
                </span>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, max_members: Math.min(20, f.max_members + 1) }))}
                  className="w-10 h-10 rounded-full font-bold text-lg transition hover:opacity-80"
                  style={{
                    border: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    background: 'var(--surface-2)',
                  }}
                >
                  +
                </button>
                <span className="text-sm" style={{ color: 'var(--text-faint)' }}>
                  человек (включая вас)
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-8 pb-8 flex gap-3">
            <button
              onClick={handleCreate}
              disabled={creating || !form.title.trim()}
              className="flex-1 text-white font-bold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-60 bg-gradient-to-r from-purple-600 to-pink-600"
              style={{ boxShadow: 'var(--shadow-md)' }}
            >
              {creating ? 'Создание...' : '🎉 Создать компанию'}
            </button>
            <Link
              href={`/events/${eventId}`}
              className="px-5 py-3 rounded-xl text-sm font-medium transition hover:opacity-80"
              style={{
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                background: 'var(--surface-2)',
              }}
            >
              Отмена
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
