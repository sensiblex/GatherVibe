"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from 'axios';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await axios.post('http://localhost:8000/login', formData);
      
      // Сохраняем токен в localStorage
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('user_id', response.data.user_id.toString());
      localStorage.setItem('username', response.data.username);
      localStorage.setItem('email', response.data.email);
      
      setMessage('✅ Вход успешен!');
      
      // Через 1 секунду переходим на главную
      setTimeout(() => {
        router.push('/');
      }, 1000);
      
    } catch (error: any) {
      if (error.response) {
        if (error.response.status === 401) {
          setMessage('❌ Неверный email или пароль');
        } else {
          setMessage(`❌ Ошибка: ${error.response.data.detail || 'Неизвестная ошибка'}`);
        }
      } else {
        setMessage('❌ Не удалось подключиться к серверу');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600 mb-2">GatherVibe</h1>
          <p className="text-gray-600">Вход в аккаунт</p>
        </div>
        
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.includes('✅') 
              ? 'bg-green-100 text-green-800 border border-green-200' 
              : 'bg-red-100 text-red-800 border border-red-200'
          }`}>
            {message}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="ваш@email.com"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Пароль</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
              placeholder="Введите пароль"
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white p-3 rounded-lg font-medium hover:bg-blue-700 transition duration-200 disabled:bg-blue-400 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Вход...
              </span>
            ) : 'Войти'}
          </button>
        </form>
        
        <div className="mt-8 space-y-4">
          <div className="text-center">
            <p className="text-gray-600">
              Нет аккаунта?{' '}
              <Link 
                href="/register" 
                className="text-blue-600 hover:text-blue-800 font-medium transition"
              >
                Зарегистрироваться
              </Link>
            </p>
          </div>
          
          <div className="text-center">
            <button 
              onClick={() => {
                // Тестовые данные для быстрого входа
                setFormData({
                  email: 'test@example.com',
                  password: 'test123'
                });
                setMessage('⚠️ Тестовые данные заполнены. Нажмите "Войти"');
              }}
              className="text-sm text-gray-500 hover:text-gray-700 transition"
            >
              Использовать тестовые данные
            </button>
          </div>
        </div>
      </div>
      
      <div className="mt-8 text-center text-gray-500 text-sm">
        <p>Демо-аккаунт для тестирования:</p>
        <p className="font-mono mt-1 bg-gray-100 p-2 rounded">
          Email: test@example.com<br />
          Пароль: test123
        </p>
      </div>
    </div>
  );
}