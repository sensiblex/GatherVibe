/** @type {import('next').NextConfig} */
const nextConfig = {
  // Отключаем индикатор сборки (включая Turbopack иконку)
  devIndicators: false,
  
  // Опционально: отключаем strict mode если возникают ошибки
  reactStrictMode: false,
  
  // Настройки для TypeScript
  typescript: {
    // Игнорировать ошибки TypeScript во время сборки
    ignoreBuildErrors: true,
  },
  eslint: {
    // Игнорировать ошибки ESLint во время сборки
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;