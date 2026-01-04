import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <nav className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">GatherVibe</h1>
          <div className="space-x-4">
            <Link href="/register" className="text-blue-600 hover:underline">
              Регистрация
            </Link>
            <Link href="/login" className="text-gray-600 hover:underline">
              Войти
            </Link>
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
          <div className="bg-white p-6 rounded-2xl shadow-lg">
            <div className="text-4xl mb-4">🎭</div>
            <h3 className="text-xl font-bold mb-2">Найди событие</h3>
            <p className="text-gray-600">Концерты, выставки, мастер-классы</p>
          </div>
          
          <div className="bg-white p-6 rounded-2xl shadow-lg">
            <div className="text-4xl mb-4">👥</div>
            <h3 className="text-xl font-bold mb-2">Собери компанию</h3>
            <p className="text-gray-600">Найди единомышленников</p>
          </div>
          
          <div className="bg-white p-6 rounded-2xl shadow-lg">
            <div className="text-4xl mb-4">🎉</div>
            <h3 className="text-xl font-bold mb-2">Получи эмоции</h3>
            <p className="text-gray-600">Посещай с удовольствием</p>
          </div>
        </div>

        <div className="space-x-4">
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
        </div>
      </main>

      <footer className="bg-white mt-16 py-8 border-t">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>Курсовой проект • GatherVibe • {new Date().getFullYear()}</p>
          <div className="mt-4">
            <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
              Бэкенд: FastAPI + SQLite
            </span>
            <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm ml-2">
              Фронтенд: Next.js + TypeScript
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}