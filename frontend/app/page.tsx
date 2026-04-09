'use client';

import Link from 'next/link';
import Navbar from './components/Navbar';
import { useAuth } from './context/AuthContext';

const STEPS = [
  {
    emoji: '🔍',
    title: 'Находи события',
    desc: 'Тысячи мероприятий — концерты, выставки, мастер-классы и фестивали.',
    num: '01',
  },
  {
    emoji: '👥',
    title: 'Собери компанию',
    desc: 'Создай комнату для похода на событие, пригласи участников и управляй составом.',
    num: '02',
  },
  {
    emoji: '🎉',
    title: 'Получай эмоции',
    desc: 'Впечатления ярче когда рядом свои. Не ходи один — ходи с GatherVibe!',
    num: '03',
  },
];

const STATS = [
  { value: '11',      label: 'городов' },
  { value: '1000+',   label: 'событий' },
  { value: '0 ₽',     label: 'навсегда бесплатно' },
];

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Navbar />

      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden pt-20 pb-24"
        style={{ background: 'linear-gradient(160deg, var(--primary-hl) 0%, var(--bg) 60%)' }}>
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-30"
          style={{ background: 'var(--primary)', filter: 'blur(80px)' }} />
        <div className="pointer-events-none absolute top-32 -left-32 w-80 h-80 rounded-full opacity-20"
          style={{ background: 'var(--primary)', filter: 'blur(60px)' }} />

        <div className="relative container mx-auto px-4 text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold mb-8 shadow-sm"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--primary)' }}>
            <span className="w-2 h-2 rounded-full animate-pulse-dot" style={{ background: 'var(--primary)' }} />
            Актуальные события в твоём городе
          </span>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-tight mb-6" style={{ color: 'var(--text)' }}>
            Найди компанию{' '}
            <span className="gradient-text">для любых<br />мероприятий</span>
          </h1>

          <p className="text-xl mb-10 max-w-2xl mx-auto leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Концерты, выставки, фестивали — не ходи один.
            Создай компанию, набери участников и получай больше эмоций!
          </p>

          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <Link href="/events" className="gv-btn-primary text-lg px-8 py-4">
              Смотреть события →
            </Link>
            {!user && (
              <Link href="/register"
                className="text-lg px-8 py-4 rounded-2xl font-bold transition hover:-translate-y-0.5"
                style={{
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                Регистрация
              </Link>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap justify-center gap-10">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-black" style={{ color: 'var(--primary)' }}>{s.value}</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-faint)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── КАК ЭТО РАБОТАЕТ ─── */}
      <section className="py-24" style={{ background: 'var(--surface)' }}>
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black mb-4" style={{ color: 'var(--text)' }}>Как это работает</h2>
            <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>
              Три простых шага до ярких впечатлений
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {STEPS.map((f) => (
              <div
                key={f.title}
                className="gv-card relative p-8 transition-all cursor-default"
              >
                <span className="absolute top-6 right-6 text-xs font-bold" style={{ color: 'var(--text-faint)' }}>{f.num}</span>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-6"
                  style={{ background: 'var(--primary-hl)' }}>
                  {f.emoji}
                </div>
                <h3 className="text-xl font-bold mb-3" style={{ color: 'var(--text)' }}>{f.title}</h3>
                <p className="leading-relaxed" style={{ color: 'var(--text-muted)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── ОНБОРДИНГ (только для незарегистрированных) ─── */}
      {!user && (
        <section className="py-20" style={{ background: 'var(--bg)' }}>
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto rounded-3xl p-10 text-center"
              style={{
                background: 'linear-gradient(135deg, var(--primary) 0%, #a855f7 100%)',
                boxShadow: 'var(--shadow-lg)',
              }}>
              <h2 className="text-3xl font-black text-white mb-3">Присоединяйся к GatherVibe 🚀</h2>
              <p className="text-lg mb-8" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Зарегистрируйся за 30 секунд и начни искать компанию уже сегодня
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Link href="/register"
                  className="bg-white font-bold text-lg px-8 py-4 rounded-2xl hover:bg-opacity-90 hover:-translate-y-0.5 transition-all shadow-lg"
                  style={{ color: 'var(--primary)' }}>
                  Создать аккаунт
                </Link>
                <Link href="/events"
                  className="font-bold text-lg px-8 py-4 rounded-2xl hover:-translate-y-0.5 transition-all"
                  style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}>
                  Смотреть события
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─── ФУТЕР ─── */}
      <footer className="py-12" style={{ background: 'var(--surface-2)', borderTop: '1px solid var(--divider)' }}>
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎭</span>
              <span className="text-lg font-black" style={{ color: 'var(--text)' }}>GatherVibe</span>
            </div>
            <div className="flex gap-6 text-sm" style={{ color: 'var(--text-muted)' }}>
              <Link href="/events" className="hover:opacity-70 transition">События</Link>
              <Link href="/register" className="hover:opacity-70 transition">Регистрация</Link>
              <Link href="/login" className="hover:opacity-70 transition">Войти</Link>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-faint)' }}>© {new Date().getFullYear()} GatherVibe</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
