"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SiteChat from './components/SiteChat';  // ← ДОБАВЛЕН ИМПОРТ ЧАТА

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');

  useEffect(() => {
    // Проверяем, есть ли токен в localStorage
    const token = localStorage.getItem('token');
    const storedUsername = localStorage.getItem('username');
    
    if (token && storedUsername) {
      setIsLoggedIn(true);
      setUsername(storedUsername);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
    localStorage.removeItem('email');
    setIsLoggedIn(false);
    setUsername('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <nav className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">GatherVibe</h1>
          
          <div className="flex items-center space-x-4">
            {isLoggedIn ? (
              <>
                <span className="text-gray-700">
                  Привет, <span className="font-semibold">{username}</span>!
                </span>
                <Link 
                  href="/profile" 
                  className="text-blue-600 hover:text-blue-800 transition"
                >
                  Профиль
                </Link>
                <button 
                  onClick={handleLogout}
                  className="bg-red-100 text-red-600 px-4 py-2 rounded-lg hover:bg-red-200 transition"
                >
                  Выйти
                </button>
              </>
            ) : (
              <>
                <Link 
                  href="/login" 
                  className="text-blue-600 hover:text-blue-800 transition"
                >
                  Войти
                </Link>
                <Link 
                  href="/register" 
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                  Регистрация
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-5xl font-bold mb-6">
          Найди компанию для <span className="text-blue-600">мероприятий</span>
        </h1>
        
        <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto">
          Концерты, выставки, фестивали — не ходи один. 
          Собирайся с единомышленниками и получай больше эмоций!
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
            <div className="text-4xl mb-4">🎭</div>
            <h3 className="text-xl font-bold mb-2">Найди событие</h3>
            <p className="text-gray-600">Концерты, выставки, мастер-классы</p>
          </div>
          
          <div className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
            <div className="text-4xl mb-4">👥</div>
            <h3 className="text-xl font-bold mb-2">Собери компанию</h3>
            <p className="text-gray-600">Найди единомышленников</p>
          </div>
          
          <div className="bg-white p-6 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
            <div className="text-4xl mb-4">🎉</div>
            <h3 className="text-xl font-bold mb-2">Получи эмоции</h3>
            <p className="text-gray-600">Посещай с удовольствием</p>
          </div>
        </div>

        <div className="space-x-4">
          {isLoggedIn ? (
            <Link
              href="/events"
              className="inline-block bg-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition"
            >
              Найти мероприятия
            </Link>
          ) : (
            <>
              <Link
                href="/register"
                className="inline-block bg-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition"
              >
                Начать бесплатно
              </Link>
              <Link
                href="/events"
                className="inline-block border-2 border-blue-600 text-blue-600 px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-50 transition"
              >
                Посмотреть события
              </Link>
            </>
          )}
        </div>

        {isLoggedIn && (
          <div className="mt-12 p-6 bg-green-50 rounded-2xl border border-green-200 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-green-800 mb-3">🎉 Вы вошли в систему!</h2>
            <p className="text-green-700">
              Теперь вы можете искать мероприятия, создавать группы и находить компанию!
            </p>
          </div>
        )}
      </main>

      <footer className="bg-white mt-16 py-8 border-t">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p className="font-semibold text-gray-800">GatherVibe</p>
          <p className="text-sm mt-1">Платформа для поиска компании на мероприятия</p>
          <div className="mt-4 flex justify-center gap-6 text-sm">
            <a href="/register" className="hover:text-blue-600 transition">Регистрация</a>
            <a href="/login" className="hover:text-blue-600 transition">Войти</a>
            <a href="/events" className="hover:text-blue-600 transition">События</a>
          </div>
          <p className="mt-6 text-xs text-gray-400">© {new Date().getFullYear()} GatherVibe.</p>
        </div>
      </footer>

      {}
      <SiteChat />
    </div>
  );
}
