'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/AuthContext';
import { ToastContainer, toast } from './components/Toast';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:8000';

interface RequestStatusPayload {
  status: 'accepted' | 'rejected';
  party_id: number;
  party_title: string;
}

/**
 * Глобальный socket-компонент для уведомлений заявителя.
 * Подписывается на комнату user_{id} и показывает toast при изменении
 * статуса заявки (событие request_status_changed).
 */
function UserNotificationSocket() {
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('subscribe_user_notifications', { token });
    });

    socket.on('request_status_changed', (data: RequestStatusPayload) => {
      if (data.status === 'accepted') {
        toast(`Вас приняли в компанию "${data.party_title}"!`, 'success');
      } else {
        toast(`Заявка в компанию "${data.party_title}" отклонена`, 'error');
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  return null;
}

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <UserNotificationSocket />
      {children}
      <ToastContainer />
    </AuthProvider>
  );
}
