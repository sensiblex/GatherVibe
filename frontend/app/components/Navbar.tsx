'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const pathname = usePathname();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const name  = localStorage.getItem('username');
    if (token && name) { setIsLoggedIn(true); setUsername(name); }
  }, []);

  const logout = () => {
    ['token', 'user_id', 'username', 'email'].forEach(k => localStorage.removeItem(k));
    setIsLoggedIn(false);
    setUsername('');
  };

  const isActive = (href: string) => pathname === href;

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-100 shadow-sm">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">

        {/* Логотип */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-xl">🎭</span>
          <span className="text-xl font-black bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            GatherVibe
          </span>
        </Link>

        {/* Нав-ссылки */}
        <div className="hidden sm:flex items-center gap-1">
          <Link
            href="/events"
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              isActive('/events')
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            События
          </Link>
        </div>

        {/* Аутентификация */}
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <>
              <span className="hidden sm:block text-sm text-gray-500">
                Привет,{' '}
                <span className="font-semibold text-gray-900">{username}</span>!
              </span>
              <Link href="/profile"
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                Профиль
              </Link>
              <button onClick={logout}
                className="text-sm bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 font-medium">
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link href="/login"
                className="text-sm text-gray-600 hover:text-indigo-600 font-medium">
                Войти
              </Link>
              <Link href="/register"
                className="text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-lg hover:opacity-90 font-medium shadow-sm">
                Регистрация
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
