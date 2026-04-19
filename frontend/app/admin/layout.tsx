'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace('/login'); return; }
    if (!user.role || user.role === 'user') { router.replace('/'); }
  }, [user, isLoading, router]);

  if (isLoading || !user || !user.role || user.role === 'user') {
    return <div style={{ padding: 24 }}>Загрузка…</div>;
  }

  const link = (href: string, label: string, adminOnly = false) => {
    if (adminOnly && user.role !== 'admin') return null;
    const active = pathname === href || pathname.startsWith(href + '/');
    return (
      <Link
        href={href}
        className={`nav-link${active ? ' active' : ''}`}
        data-testid={`admin-nav-${href.replace(/\//g, '-')}`}
        style={{ display: 'block', padding: '8px 12px', borderRadius: 6 }}
      >
        {label}
      </Link>
    );
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside
        style={{
          width: 220, borderRight: '1px solid var(--border, #eee)',
          padding: 16, position: 'sticky', top: 0, height: '100vh',
        }}
      >
        <h2 style={{ fontSize: 18, margin: '8px 0 16px' }}>Модерация</h2>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {link('/admin', 'Обзор', true)}
          {link('/admin/reports', 'Жалобы')}
          {link('/admin/users', 'Пользователи')}
          {link('/admin/appeals', 'Апелляции')}
          {link('/admin/flags', 'Feature flags', true)}
          {link('/admin/banned-words', 'Запрещённые слова', true)}
          {link('/admin/broadcast', 'Рассылка', true)}
          {link('/admin/audit', 'Аудит', true)}
        </nav>
        <div style={{ marginTop: 24, fontSize: 12, opacity: 0.7 }}>
          {user.username} · {user.role}
        </div>
      </aside>
      <div style={{ flex: 1, padding: 24, overflow: 'auto' }}>{children}</div>
    </div>
  );
}
