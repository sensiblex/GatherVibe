'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import { useAuth } from '../context/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [form, setForm]       = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Ошибка входа');
      }
      const data = await res.json();
      login(data.access_token, {
        id: data.user_id,
        username: data.username,
        email: data.email,
      });
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">

          <div className="text-center mb-8">
            <span className="text-4xl">🎭</span>
            <h1 className="text-2xl font-black mt-3" style={{ color: 'var(--text)' }}>Вход в аккаунт</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Рады видеть снова!</p>
          </div>

          <div
            className="rounded-3xl shadow-sm p-8"
            style={{
              background: 'var(--card-bg, var(--surface))',
              border: '1px solid var(--border)',
            }}
          >
            {error && (
              <div
                className="mb-5 px-4 py-3 rounded-xl text-sm"
                style={{
                  background: 'color-mix(in oklch, var(--color-error, #a12c7b) 10%, transparent)',
                  border: '1px solid color-mix(in oklch, var(--color-error, #a12c7b) 30%, transparent)',
                  color: 'var(--color-error, #ef4444)',
                }}
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  className="block text-sm font-semibold mb-1.5"
                  style={{ color: 'var(--text)' }}
                >
                  Email
                </label>
                <input
                  type="email" name="email" value={form.email}
                  onChange={handleChange} placeholder="ваш@email.com" required
                  className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                />
              </div>
              <div>
                <label
                  className="block text-sm font-semibold mb-1.5"
                  style={{ color: 'var(--text)' }}
                >
                  Пароль
                </label>
                <input
                  type="password" name="password" value={form.password}
                  onChange={handleChange} placeholder="Введите пароль" required
                  className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                />
              </div>

              <button
                type="submit" disabled={loading}
                className="w-full py-3 rounded-xl font-bold hover:opacity-90 shadow-sm transition disabled:opacity-60"
                style={{
                  background: 'var(--accent-gradient, linear-gradient(135deg,#4f46e5,#7c3aed))',
                  color: '#fff',
                }}
              >
                {loading ? 'Входим...' : 'Войти'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setForm({ email: 'test@example.com', password: '123456' })}
              className="w-full mt-4 text-xs py-1.5 transition hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
            >
              Использовать тестовые данные
            </button>
          </div>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
            Нет аккаунта?{' '}
            <Link
              href="/register"
              className="font-semibold hover:underline transition"
              style={{ color: 'var(--accent, #4f46e5)' }}
            >
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
