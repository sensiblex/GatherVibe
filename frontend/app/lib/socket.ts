/**
 * socket.ts — синглтон Socket.IO для GatherVibe.
 *
 * Одно соединение на всё приложение.
 * Жизненный цикл управляется из UserNotificationSocket (ClientLayout.tsx):
 *   connectSocket()    — вызывается после логина / восстановления сессии
 *   disconnectSocket() — вызывается после логаута
 *
 * Компоненты (EventChat, PartyChat и т.д.) получают уже подключённый сокет
 * через getSocket() и лишь join/leave своих комнат.
 */

import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:8000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      autoConnect: false,
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  if (!s.connected) s.connect();
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
