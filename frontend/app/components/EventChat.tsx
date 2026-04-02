'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type Message = {
  message: string;
  userId: string;
  timestamp?: string;
};

/** Read a cookie by name (works client-side only). */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface EventChatProps {
  eventId: string;
}

export default function EventChat({ eventId }: EventChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [userId, setUserId] = useState<string>('guest');
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Resolve userId: prefer cookie "username", fallback to JWT sub or 'guest'
    const cookieUser = getCookie('username');
    const cookieToken = getCookie('token');
    if (cookieUser) {
      setUserId(cookieUser);
    } else if (cookieToken) {
      try {
        // Decode JWT payload (no verification — display only)
        const payload = JSON.parse(atob(cookieToken.split('.')[1]));
        setUserId(payload.sub || payload.username || 'guest');
      } catch {
        setUserId('guest');
      }
    }

    // Each event gets its own socket connection scoped to this component
    const socket = io(API_BASE, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_event_chat', eventId);
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('receive_message', (data: Message) => {
      setMessages(prev => [...prev, data]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [eventId]);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    const socket = socketRef.current;
    if (!socket || !input.trim()) return;

    socket.emit('send_message', {
      eventId,
      message: input.trim(),
      userId,
    });

    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
          💬 Чат мероприятия
        </h2>
        <span
          className={`w-2 h-2 rounded-full ${
            connected ? 'bg-emerald-400' : 'bg-gray-300'
          }`}
          title={connected ? 'Подключено' : 'Не подключено'}
        />
      </div>

      {/* Messages */}
      <div className="p-3 h-56 overflow-y-auto text-sm space-y-2 bg-gray-50">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 text-xs pt-6">
            Будьте первым — напишите сообщение!
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs shrink-0">
              {m.userId?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <span className="font-semibold text-gray-800">{m.userId}: </span>
              <span className="text-gray-600">{m.message}</span>
              {m.timestamp && (
                <span className="text-gray-300 text-xs ml-1">
                  {new Date(m.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-100 flex gap-2">
        <input
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Написать сообщение..."
          disabled={!connected}
        />
        <button
          onClick={sendMessage}
          disabled={!connected || !input.trim()}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition font-medium"
        >
          ▶
        </button>
      </div>
    </div>
  );
}
