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
      // Обновляем контекст и localStorage через AuthContext
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
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">

          <div className="text-center mb-8">
            <span className="text-4xl">🎭</span>
            <h1 className="text-2xl font-black text-gray-900 mt-3">Вход в аккаунт</h1>
            <p className="text-gray-400 text-sm mt-1">Рады видеть снова!</p>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
            {error && (
              <div className="mb-5 px-4 py-3 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
                <input
                  type="email" name="email" value={form.email}
                  onChange={handleChange} placeholder="ваш@email.com" required
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Пароль</label>
                <input
                  type="password" name="password" value={form.password}
                  onChange={handleChange} placeholder="Введите пароль" required
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white transition"
                />
              </div>

              <button
                type="submit" disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-bold hover:opacity-90 shadow-sm shadow-indigo-100 transition disabled:opacity-60"
              >
                {loading ? 'Входим...' : 'Войти'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setForm({ email: 'test@example.com', password: '123456' })}
              className="w-full mt-4 text-xs text-gray-400 hover:text-indigo-500 transition py-1.5"
            >
              Использовать тестовые данные
            </button>
          </div>

          <p className="text-center text-sm text-gray-500 mt-6">
            Нет аккаунта?{' '}
            <Link href="/register" className="text-indigo-600 font-semibold hover:text-indigo-800 transition">
              Зарегистрироваться
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
