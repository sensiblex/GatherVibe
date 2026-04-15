'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Socket } from 'socket.io-client';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/AuthContext';
import { ToastContainer, toast } from './components/Toast';
import { getSocket, connectSocket, disconnectSocket } from './lib/socket';

interface RequestStatusPayload {
  status: 'accepted' | 'rejected';
  party_id: number;
  party_title: string;
}

interface KickedFromPartyPayload {
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
  const router = useRouter();
  const pathname = usePathname();
  // Refs to avoid recreating socket on router/pathname changes
  const routerRef = useRef(router);
  const pathnameRef = useRef(pathname);
  useEffect(() => { routerRef.current = router; }, [router]);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }

    connectSocket();
    const socket = getSocket();
    socketRef.current = socket;

    const onConnect = () => {
      socket.emit('subscribe_user_notifications', { token });
    };

    // Если уже подключены — сразу подписываемся
    if (socket.connected) onConnect();
    socket.on('connect', onConnect);

    const onStatusChanged = (data: RequestStatusPayload) => {
      if (data.status === 'accepted') {
        toast(`Вас приняли в компанию "${data.party_title}"!`, 'success');
      } else {
        toast(`Заявка в компанию "${data.party_title}" отклонена`, 'error');
      }
      window.dispatchEvent(new CustomEvent('notification:new'));
    };

    const onKicked = (data: KickedFromPartyPayload) => {
      toast(`Вы были исключены из компании "${data.party_title}"`, 'error');
      window.dispatchEvent(new CustomEvent('notification:new'));
      if (pathnameRef.current === `/parties/${data.party_id}`) {
        routerRef.current.push('/my-events');
      }
    };

    const onNewRequest = () => {
      window.dispatchEvent(new CustomEvent('notification:new'));
    };

    socket.on('request_status_changed', onStatusChanged);
    socket.on('kicked_from_party', onKicked);
    socket.on('new_party_request', onNewRequest);

    return () => {
      socket.off('connect', onConnect);
      socket.off('request_status_changed', onStatusChanged);
      socket.off('kicked_from_party', onKicked);
      socket.off('new_party_request', onNewRequest);
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
