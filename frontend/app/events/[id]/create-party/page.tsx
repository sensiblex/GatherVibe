'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../../../components/Navbar';
import { useAuth } from '../../../context/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
      // token is null only after hydration when user is truly not logged in
      router.replace('/login');
    }
  }, [token, router]);

  const handleCreate = async () => {
    if (!token) return;
    if (!form.title.trim()) { setError('Название обязательно'); return; }
    setCreating(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/parties/${eventId}`, {
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
        setError(data.detail ?? 'Ошибка создания');
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
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="container mx-auto px-4 py-10 max-w-lg">
        <nav className="flex items-center gap-2 text-sm text-gray-400 mb-8">
          <Link href="/events" className="hover:text-indigo-600 transition">События</Link>
          <span>/</span>
          <Link href={`/events/${eventId}`} className="hover:text-indigo-600 transition">Мероприятие</Link>
          <span>/</span>
          <span className="text-gray-700">Создать компанию</span>
        </nav>

        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-8 py-6 bg-gradient-to-r from-purple-600 to-pink-600">
            <div className="flex items-center gap-3">
              <span className="text-4xl">🎉</span>
              <div>
                <h1 className="text-xl font-black text-white">Создать компанию</h1>
                <p className="text-purple-200 text-sm mt-0.5">Найди единомышленников для похода</p>
              </div>
            </div>
          </div>

          <div className="px-8 py-6 flex flex-col gap-5">
            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                Название компании *
              </label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value.slice(0, 60) }))}
                placeholder="Например: Приятная компания на вечер"
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition"
              />
              <span className="text-xs text-gray-400 text-right">{form.title.length}/60</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                Описание
              </label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value.slice(0, 300) }))}
                placeholder="Кого ищешь, планы на вечер, пожелания..."
                rows={4}
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition resize-none"
              />
              <span className="text-xs text-gray-400 text-right">{form.description.length}/300</span>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                Макс. количество участников
              </label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, max_members: Math.max(2, f.max_members - 1) }))}
                  className="w-10 h-10 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100 transition font-bold text-lg"
                >
                  −
                </button>
                <span className="text-2xl font-black text-gray-900 w-8 text-center">
                  {form.max_members}
                </span>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, max_members: Math.min(20, f.max_members + 1) }))}
                  className="w-10 h-10 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-100 transition font-bold text-lg"
                >
                  +
                </button>
                <span className="text-sm text-gray-400">человек (включая вас)</span>
              </div>
            </div>
          </div>

          <div className="px-8 pb-8 flex gap-3">
            <button
              onClick={handleCreate}
              disabled={creating || !form.title.trim()}
              className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-60 shadow-md shadow-purple-100"
            >
              {creating ? 'Создание...' : '🎉 Создать компанию'}
            </button>
            <Link
              href={`/events/${eventId}`}
              className="px-5 py-3 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition text-sm font-medium"
            >
              Отмена
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
