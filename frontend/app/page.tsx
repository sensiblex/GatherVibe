export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold mb-4">GatherVibe</h1>
      <p className="text-lg mb-8">Платформа для поиска компании на мероприятия</p>
      
      <div className="space-y-4">
        <a 
          href="http://localhost:8000" 
          target="_blank"
          className="block p-4 bg-blue-500 text-white rounded-lg text-center"
        >
          Проверить бэкенд API
        </a>
        
        <a 
          href="http://localhost:8000/docs" 
          target="_blank"
          className="block p-4 bg-green-500 text-white rounded-lg text-center"
        >
          Открыть документацию API
        </a>
        
        <div className="p-4 bg-gray-100 rounded-lg">
          <h2 className="font-bold mb-2">Что работает:</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>✅ FastAPI сервер на порту 8000</li>
            <li>✅ Next.js фронтенд на порту 3000</li>
            <li>✅ Готово к дальнейшей разработке!</li>
          </ul>
        </div>
      </div>
    </div>
  );
}