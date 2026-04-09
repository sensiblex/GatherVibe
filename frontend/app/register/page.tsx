'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import { INTERESTS_LIST } from '../lib/interests';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep]           = useState<1 | 2>(1);
  const [form, setForm]           = useState({ email: '', username: '', password: '', city: '' });
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const toggleInterest = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.username || !form.password) {
      setError('Заполните все обязательные поля');
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          // Хранить без пробелов: "concert,cinema" — единый формат с profile
          interests: Array.from(selected).join(','),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Ошибка регистрации');
      }
      router.push('/login');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">

          <div className="text-center mb-8">
            <span className="text-4xl">{step === 1 ? '🎭' : '✨'}</span>
            <h1 className="text-2xl font-black mt-3" style={{ color: 'var(--text)' }}>
              {step === 1 ? 'Создать аккаунт' : 'Твои интересы'}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {step === 1
                ? 'Находи компанию для любых мероприятий'
                : 'Выбери чтобы мы лучше подбирали события — или пропусти'}
            </p>
            {/* Progress */}
            <div className="flex justify-center gap-2 mt-4">
              {[1, 2].map(s => (
                <div key={s} className="h-1.5 w-12 rounded-full transition-all" style={{
                  background: s <= step ? 'var(--primary)' : 'var(--divider)',
                }} />
              ))}
            </div>
          </div>

          <div className="rounded-3xl p-8" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            {error && (
              <div className="mb-5 px-4 py-3 rounded-xl text-sm"
                style={{ background: 'var(--error-hl)', color: 'var(--error)', border: '1px solid var(--error-hl)' }}>
                {error}
              </div>
            )}

            {step === 1 ? (
              <form onSubmit={handleStep1} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Email *</label>
                  <input type="email" name="email" value={form.email} onChange={handleChange}
                    placeholder="ваш@email.com" required className="gv-input" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Имя пользователя *</label>
                  <input type="text" name="username" value={form.username} onChange={handleChange}
                    placeholder="Ваш никнейм" required className="gv-input" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Пароль *</label>
                  <input type="password" name="password" value={form.password} onChange={handleChange}
                    placeholder="Не менее 6 символов" required minLength={6} className="gv-input" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>Город</label>
                  <input type="text" name="city" value={form.city} onChange={handleChange}
                    placeholder="Казань" className="gv-input" />
                </div>
                <button type="submit" className="gv-btn-primary w-full mt-2">
                  Далее →
                </button>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-2">
                  {INTERESTS_LIST.map(item => {
                    const active = selected.has(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleInterest(item.id)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-left transition"
                        style={{
                          background: active ? 'var(--primary-hl)' : 'var(--surface-2)',
                          color: active ? 'var(--primary)' : 'var(--text-muted)',
                          border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                          boxShadow: active ? 'var(--shadow-sm)' : 'none',
                        }}
                      >
                        <span className="w-4 h-4 rounded flex items-center justify-center shrink-0 text-xs"
                          style={{
                            background: active ? 'var(--primary)' : 'var(--divider)',
                            color: active ? '#fff' : 'transparent',
                          }}>
                          {active && '✓'}
                        </span>
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                {selected.size > 0 && (
                  <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                    Выбрано: {selected.size}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm transition"
                    style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    ← Назад
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    className="gv-btn-primary flex-[2]">
                    {loading ? 'Создаём...' : '🎉 Готово!'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => { setSelected(new Set()); handleSubmit(); }}
                  className="w-full text-xs py-2 transition"
                  style={{ color: 'var(--text-faint)' }}>
                  Пропустить
                </button>
              </div>
            )}
          </div>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
            Уже есть аккаунт?{' '}
            <Link href="/login" className="font-semibold transition" style={{ color: 'var(--primary)' }}>
              Войти
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
