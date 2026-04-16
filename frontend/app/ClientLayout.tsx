'use client';

import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Socket } from 'socket.io-client';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/AuthContext';
import { NotificationsProvider, useNotifications, NotificationItem } from './context/NotificationsContext';
import { ToastContainer, toast } from './components/Toast';
import { getSocket, connectSocket, disconnectSocket } from './lib/socket';

const toastTypeMap: Record<string, 'success' | 'error' | 'info'> = {
  request_status_changed: 'success',
  kicked_from_party: 'error',
  new_party_request: 'info',
  party_closed: 'info',
};

function getToastType(notifType: string, notifTitle: string): 'success' | 'error' | 'info' {
  if (notifType === 'request_status_changed' && notifTitle.toLowerCase().includes('отклон')) {
    return 'error';
  }
  return toastTypeMap[notifType] ?? 'info';
}

function UserNotificationSocket() {
  const { token } = useAuth();
  const { addNotification } = useNotifications();
  const socketRef = useRef<Socket | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const routerRef = useRef(router);
  const pathnameRef = useRef(pathname);
  const addNotificationRef = useRef(addNotification);
  useEffect(() => { routerRef.current = router; }, [router]);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
  useEffect(() => { addNotificationRef.current = addNotification; }, [addNotification]);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }

    connectSocket();
    const socket = getSocket();
    socketRef.current = socket;

    const onConnect = () => {
      socket.emit('subscribe_notifications', { token });
    };

    if (socket.connected) onConnect();
    socket.on('connect', onConnect);

    const onNewNotification = (data: NotificationItem) => {
      addNotificationRef.current(data);

      let parsedData: Record<string, unknown> = {};
      try { parsedData = data.data ? JSON.parse(data.data) : {}; } catch { /* ignore parse errors */ }

      const partyId = parsedData.party_id as number | undefined;
      const toastType = getToastType(data.type, data.title);

      toast(
        data.title,
        toastType,
        partyId
          ? { label: 'Смотреть', onClick: () => routerRef.current.push(`/parties/${partyId}`) }
          : undefined,
      );

      // Редирект при кике, если пользователь находится на странице этой пати
      if (data.type === 'kicked_from_party' && partyId) {
        if (pathnameRef.current === `/parties/${partyId}`) {
          routerRef.current.push('/my-events');
        }
      }
    };

    socket.on('new_notification', onNewNotification);

    return () => {
      socket.off('connect', onConnect);
      socket.off('new_notification', onNewNotification);
      socketRef.current = null;
    };
  }, [token]);

  return null;
}

function InnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <UserNotificationSocket />
      {children}
      <ToastContainer />
    </>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <InnerLayout>{children}</InnerLayout>
      </NotificationsProvider>
    </AuthProvider>
  );
}
