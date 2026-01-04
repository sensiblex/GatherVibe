"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    city: '',
    interests: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await axios.post('http://localhost:8000/register', formData);
      setMessage(`✅ Регистрация успешна! ID: ${response.data.id}`);
      
      // Через 2 секунды переходим на главную
      setTimeout(() => {
        router.push('/');
      }, 2000);
      
    } catch (error: any) {
      if (error.response) {
        setMessage(`❌ Ошибка: ${error.response.data.detail || 'Неизвестная ошибка'}`);
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
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2">GatherVibe</h1>
        <p className="text-gray-600 text-center mb-8">Регистрация</p>
        
        {message && (
          <div className={`mb-4 p-3 rounded-lg ${message.includes('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {message}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email *</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="ваш@email.com"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Имя пользователя *</label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Придумайте имя"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Пароль *</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Не менее 6 символов"
              required
              minLength={6}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Город</label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Москва"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Интересы</label>
            <input
              type="text"
              name="interests"
              value={formData.interests}
              onChange={handleChange}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="концерты, выставки, спорт"
            />
            <p className="text-sm text-gray-500 mt-1">Перечислите через запятую</p>
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white p-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:bg-blue-400"
          >
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-gray-600">
            Уже есть аккаунт?{' '}
            <button 
              onClick={() => router.push('/login')}
              className="text-blue-600 hover:underline"
            >
              Войти
            </button>
          </p>
        </div>
      </div>
      
      <div className="mt-8 text-center text-gray-500 text-sm">
        <p>После регистрации вы сможете:</p>
        <ul className="mt-2 space-y-1">
          <li>✅ Искать мероприятия</li>
          <li>✅ Создавать группы</li>
          <li>✅ Находить компанию</li>
        </ul>
      </div>
    </div>
  );
}