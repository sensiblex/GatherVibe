'use client';

import { AuthProvider } from './context/AuthContext';
import { ToastContainer } from './components/Toast';

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      {children}
      <ToastContainer />
    </AuthProvider>
  );
}
