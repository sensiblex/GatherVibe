'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiFetch } from '../lib/apiFetch';
import { useAuth } from './AuthContext';

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  data: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationsContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  addNotification: (n: NotificationItem) => void;
  markRead: (id: number) => void;
  markAllRead: () => void;
  isLoaded: boolean;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Загружаем при наличии токена; сбрасываем при логауте
  useEffect(() => {
    if (!token) {
      setNotifications([]);
      setIsLoaded(true);
      return;
    }
    setIsLoaded(false);
    apiFetch('/notifications?limit=100')
      .then(r => r.ok ? r.json() : [])
      .then((data: NotificationItem[]) => {
        setNotifications(data);
        setIsLoaded(true);
      })
      .catch(() => setIsLoaded(true));
  }, [token]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const addNotification = useCallback((n: NotificationItem) => {
    setNotifications(prev => [n, ...prev]);
  }, []);

  const markRead = useCallback((id: number) => {
    apiFetch('/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ notification_id: id }),
    }).then(r => {
      if (r.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      }
    });
  }, []);

  const markAllRead = useCallback(() => {
    apiFetch('/notifications/read-all', { method: 'POST' }).then(r => {
      if (r.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      }
    });
  }, []);

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, addNotification, markRead, markAllRead, isLoaded }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}
