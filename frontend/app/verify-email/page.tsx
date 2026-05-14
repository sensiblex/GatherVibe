'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import { resolveApiBase } from '../lib/apiBase';

const API_BASE = resolveApiBase();

type Status = 'loading' | 'success' | 'error';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('loading');
  const [resendEmail, setResendEmail] = useState('');
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [resendError, setResendError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      return;
    }
    fetch(`${API_BASE}/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(res => {
        if (res.ok) setStatus('success');
        else setStatus('error');
      })
      .catch(() => setStatus('error'));
  }, [searchParams]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResendState('sending');
    setResendError('');
    try {
      const res = await fetch(`${API_BASE}/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail }),
      });
      if (res.ok) {
        setResendState('sent');
      } else {
        const data = await res.json();
        setResendError(data.detail || 'Ошибка отправки');
        setResendState('error');
      }
    } catch {
      setResendError('Ошибка сети');
      setResendState('error');
    }
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />
      <div className="flex items-center justify-center px-4 py-16">
        <div
          className="w-full max-w-md rounded-3xl shadow-sm p-8 text-center"
          style={{
            background: 'var(--card-bg, var(--surface))',
            border: '1px solid var(--border)',
          }}
        >
          {status === 'loading' && (
            <>
              <div className="text-4xl mb-4">⏳</div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>
                Проверяем...
              </h1>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-4xl mb-4">✅</div>
              <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>
                Email подтверждён!
              </h1>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Теперь вы можете войти в аккаунт.
              </p>
              <button
                onClick={() => router.push('/login')}
                className="w-full py-3 rounded-xl font-bold hover:opacity-90 shadow-sm transition"
                style={{
                  background: 'var(--accent-gradient, linear-gradient(135deg,#4f46e5,#7c3aed))',
                  color: '#fff',
                }}
              >
                Войти
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-4xl mb-4">❌</div>
              <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>
                Ссылка недействительна или устарела
              </h1>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                Запросите новую ссылку подтверждения.
              </p>

              {resendState === 'sent' ? (
                <p className="text-sm font-medium" style={{ color: '#01696f' }}>
                  Письмо отправлено — проверьте почту.
                </p>
              ) : (
                <form onSubmit={handleResend} className="space-y-3">
                  <input
                    type="email"
                    value={resendEmail}
                    onChange={e => setResendEmail(e.target.value)}
                    placeholder="ваш@email.com"
                    required
                    className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                    }}
                  />
                  {resendError && (
                    <p className="text-xs" style={{ color: 'var(--color-error, #ef4444)' }}>
                      {resendError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={resendState === 'sending'}
                    className="w-full py-3 rounded-xl font-bold hover:opacity-90 shadow-sm transition disabled:opacity-60"
                    style={{
                      background: 'var(--accent-gradient, linear-gradient(135deg,#4f46e5,#7c3aed))',
                      color: '#fff',
                    }}
                  >
                    {resendState === 'sending' ? 'Отправляем...' : 'Отправить новую ссылку'}
                  </button>
                </form>
              )}

              <p className="text-sm mt-4" style={{ color: 'var(--text-muted)' }}>
                <Link href="/login" className="hover:underline" style={{ color: 'var(--accent, #4f46e5)' }}>
                  Вернуться на страницу входа
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}

