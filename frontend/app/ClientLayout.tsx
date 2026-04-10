'use client';

import { AuthProvider } from './context/AuthContext';
import { ToastContainer } from './components/Toast';

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Debug: log what children is
  console.log('ClientLayout children:', children);
  
  // Check if children is an error object (like validation error)
  if (children && typeof children === 'object' && children !== null) {
    const childObj = children as any;
    if (childObj.type && childObj.msg && childObj.loc && childObj.input) {
      console.error('Validation error object passed as children:', childObj);
      // Return a fallback UI
      return (
        <AuthProvider>
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <h1>Ошибка валидации</h1>
            <p>Произошла ошибка при загрузке страницы. Пожалуйста, обновите страницу.</p>
            <pre style={{ background: '#f5f5f5', padding: '1rem', marginTop: '1rem' }}>
              {JSON.stringify(childObj, null, 2)}
            </pre>
          </div>
          <ToastContainer />
        </AuthProvider>
      );
    }
  }
  
  return (
    <AuthProvider>
      {children}
      <ToastContainer />
    </AuthProvider>
  );
}