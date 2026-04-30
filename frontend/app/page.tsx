'use client';

import Link from 'next/link';
import Navbar from './components/Navbar';
import { useAuth } from './context/AuthContext';

const STEPS = [
  {
    num: '01',
    title: 'Находи события',
    desc: 'Тысячи мероприятий по всей России. Концерты, выставки, театр, мастер-классы, фестивали.',
  },
  {
    num: '02',
    title: 'Собери компанию',
    desc: 'Создай группу, набери участников со схожими интересами, скоординируйтесь в чате.',
  },
  {
    num: '03',
    title: 'Получай впечатления',
    desc: 'Встречайтесь, ходите на события вместе. Впечатления становятся глубже когда есть кому их разделить.',
  },
];

export default function Home() {
  const { user } = useAuth();

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Navbar />

      {/* ─── HERO ─── */}
      <header id="home">
        <section className="hero">
          <div className="hero-city-card" aria-hidden="true">
            <img
              src="https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=800&q=85&auto=format&fit=crop"
              alt=""
            />
          </div>

          <div className="hero-grid">
            <div className="hero-left">
              <div className="hero-eyebrow fu">
                <span className="eyebrow-dot blink" />
                <span className="eyebrow-line" />
                <span className="t-label">Уже в 11 городах России</span>
              </div>

              <h1 className="hero-title">
                <span className="word word-1">Найди</span><br />
                <span className="word word-2"><em>компанию</em></span><br />
                <span className="word word-3">на вечер</span>
              </h1>

              <p className="hero-sub fu-3">
                Собери компанию на любое событие в своём городе.
              </p>

              <div className="hero-actions fu-4">
                <Link href="/events" className="btn btn-ink btn-lg">
                  Смотреть события
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
                {!user && (
                  <Link href="/register" className="btn btn-ghost btn-lg">Регистрация</Link>
                )}
              </div>
            </div>

            <div className="hero-right fu-5">
              <div>
                <div className="hero-stat-num">11</div>
                <div className="hero-stat-label">городов России</div>
              </div>
              <hr className="hero-stat-rule" />
              <div>
                <div className="hero-stat-num">1000+</div>
                <div className="hero-stat-label">событий каждую неделю</div>
              </div>
              <hr className="hero-stat-rule" />
              <div>
                <div className="hero-stat-num">0 ₽</div>
                <div className="hero-stat-label">навсегда бесплатно</div>
              </div>
            </div>
          </div>
        </section>
      </header>

      {/* ─── STEPS ─── */}
      <section className="steps-section">
        <div className="steps-top">
          <div>
            <div className="t-label" style={{ marginBottom: 14 }}>Как это работает</div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(1.5rem, 2.8vw, 2.25rem)',
              fontWeight: 800,
              letterSpacing: '-.03em',
              lineHeight: 1.1,
              color: 'var(--text)',
              maxWidth: 400,
            }}>
              От афиши до встречи — три шага
            </div>
          </div>
          <p className="steps-top-sub">
            Находи события, собирай компанию со схожими интересами, встречайтесь и получайте впечатления.
          </p>
        </div>

        <div className="steps-cols">
          {STEPS.map((s) => (
            <div className="step-col" key={s.num}>
              <div className="step-num" aria-hidden="true">{s.num}</div>
              <div className="step-title">{s.title}</div>
              <p className="step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA (только для незарегистрированных) ─── */}
      {!user && (
        <section className="cta-section">
          <div className="cta-inner">
            <div>
              <h2 className="cta-title">
                Зарегистрируйся.<br />
                Это займёт 30 секунд.
              </h2>
              <p className="cta-sub">Бесплатно, без лишних данных. Только события и компания.</p>
            </div>
            <div className="cta-actions">
              <Link href="/register" className="btn btn-ink btn-lg">Создать аккаунт</Link>
              <Link href="/events" className="btn btn-ghost btn-lg">Смотреть события</Link>
            </div>
          </div>
        </section>
      )}

      {/* ─── FOOTER ─── */}
      <footer className="gv-footer">
        <div className="footer-inner">
          <Link href="/" className="logo" style={{ fontSize: '1rem' }}>
            <svg width="18" height="13" viewBox="0 0 22 16" fill="none" aria-hidden="true">
              <circle cx="6"  cy="8" r="6" fill="var(--ink)" />
              <circle cx="16" cy="8" r="6" fill="var(--ink)" opacity=".38" />
            </svg>
            GatherVibe
          </Link>
          <div className="footer-links">
            <Link href="/events">События</Link>
            {user && <Link href="/profile">Профиль</Link>}
            {!user && <Link href="/login">Войти</Link>}
            {!user && <Link href="/register">Регистрация</Link>}
          </div>
          <div className="footer-copy">© {new Date().getFullYear()} GatherVibe</div>
        </div>
      </footer>
    </div>
  );
}
