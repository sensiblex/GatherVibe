'use client';

import Link from 'next/link';
import Navbar from './components/Navbar';
import SiteChat from './components/SiteChat';

const FEATURES = [
  {
    emoji: '🔍',
    title: 'Находи события',
    desc: 'Реальные мероприятия из KudaGo — концерты, выставки, мастер-классы и фестивали.',
    gradient: 'from-indigo-500 to-blue-500',
    bg: 'bg-indigo-50',
  },
  {
    emoji: '👥',
    title: 'Собери компанию',
    desc: 'Общайся в чате мероприятия, находи единомышленников и планируй походы вместе.',
    gradient: 'from-purple-500 to-pink-500',
    bg: 'bg-purple-50',
  },
  {
    emoji: '🎉',
    title: 'Получай эмоции',
    desc: 'Впечатления становятся ярче, когда рядом свои. Не ходи один — ходи с GatherVibe!',
    gradient: 'from-orange-500 to-rose-500',
    bg: 'bg-orange-50',
  },
];

const STATS = [
  { value: '11', label: 'городов' },
  { value: '1000+', label: 'событий' },
  { value: 'Бесплатно', label: 'для пользователей' },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50/60 via-white to-white pt-20 pb-24">
        {/* Декоративные блобы */}
        <div className="pointer-events-none absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-indigo-100 opacity-50 blur-3xl" />
        <div className="pointer-events-none absolute top-40 -left-40 w-[400px] h-[400px] rounded-full bg-purple-100 opacity-40 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-1/3 w-72 h-72 rounded-full bg-pink-100 opacity-30 blur-3xl" />

        <div className="relative container mx-auto px-4 text-center">
          {/* Пилюля */}
          <span className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-100 text-indigo-600 text-sm font-semibold px-4 py-1.5 rounded-full mb-8 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            Реальные события через KudaGo API
          </span>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black text-gray-900 leading-tight mb-6">
            Найди компанию{' '}
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">
              для любых<br />мероприятий
            </span>
          </h1>

          <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed">
            Концерты, выставки, фестивали — не ходи один.
            Собирайсь с единомышленниками и получай больше эмоций!
          </p>

          <div className="flex flex-wrap justify-center gap-4 mb-16">
            <Link
              href="/events"
              className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:opacity-90 shadow-lg shadow-indigo-200 hover:shadow-xl hover:shadow-indigo-200 hover:-translate-y-0.5 transition-all"
            >
              Смотреть события →
            </Link>
            <Link
              href="/register"
              className="bg-white text-gray-800 px-8 py-4 rounded-2xl font-bold text-lg border border-gray-200 hover:border-indigo-200 hover:bg-indigo-50 hover:-translate-y-0.5 shadow-sm transition-all"
            >
              Регистрация
            </Link>
          </div>

          {/* Статистика */}
          <div className="flex flex-wrap justify-center gap-10">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl font-black text-indigo-600">{s.value}</p>
                <p className="text-sm text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── ФИЧЕРС ─── */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-gray-900 mb-4">Как это работает</h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              Три простых шага до ярких впечатлений
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="group relative bg-white rounded-3xl p-8 border border-gray-100 hover:border-indigo-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all"
              >
                {/* Номер шага */}
                <span className="absolute top-6 right-6 text-xs font-bold text-gray-300">
                  0{i + 1}
                </span>
                {/* Иконка */}
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${f.gradient} text-2xl mb-6 shadow-md`}>
                  {f.emoji}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{f.title}</h3>
                <p className="text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="py-20 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-black text-white mb-4">
            Готов начать?  🚀
          </h2>
          <p className="text-indigo-100 text-lg mb-10 max-w-xl mx-auto">
            Регистрируйся бесплатно и начни искать компанию уже сегодня
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/register"
              className="bg-white text-indigo-600 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-indigo-50 shadow-lg hover:-translate-y-0.5 transition-all"
            >
              Создать аккаунт
            </Link>
            <Link
              href="/events"
              className="bg-white/10 border border-white/30 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-white/20 hover:-translate-y-0.5 transition-all"
            >
              Смотреть события
            </Link>
          </div>
        </div>
      </section>

      {/* ─── ФУТЕР ─── */}
      <footer className="bg-gray-950 py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎭</span>
              <span className="text-lg font-black text-white">GatherVibe</span>
            </div>
            <div className="flex gap-6 text-sm text-gray-400">
              <Link href="/events" className="hover:text-white transition">События</Link>
              <Link href="/register" className="hover:text-white transition">Регистрация</Link>
              <Link href="/login" className="hover:text-white transition">Войти</Link>
            </div>
            <p className="text-xs text-gray-600">© {new Date().getFullYear()} GatherVibe</p>
          </div>
        </div>
      </footer>

      <SiteChat />
    </div>
  );
}
