'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:8000';
const API_BASE   = process.env.NEXT_PUBLIC_API_URL    || 'http://localhost:8000';

interface Message {
  message: string;
  userId: string;
  username: string;
  timestamp: string;
}

export default function EventChat({
  eventId,
  currentUserId,
  currentUsername,
}: {
  eventId: string;
  currentUserId: string;
  currentUsername: string;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 1. Load history from DB
  useEffect(() => {
    fetch(`${API_BASE}/messages/event_${eventId}?limit=100`)
      .then(r => r.ok ? r.json() : [])
      .then((data: Message[]) => {
        if (Array.isArray(data)) setMessages(data);
      })
      .catch(() => {});
  }, [eventId]);

  // 2. Socket connection
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    const join = () => {
      setConnected(true);
      socket.emit('join_event_chat', eventId);
    };

    socket.on('connect', join);
    if (socket.connected) join();

    socket.on('disconnect', () => setConnected(false));

    const handleMessage = (data: Message) => {
      setMessages(prev => [...prev, data].slice(-200));
    };
    socket.on('receive_message', handleMessage);

    return () => {
      socket.emit('leave_event_chat', eventId);
      socket.off('connect', join);
      socket.off('disconnect');
      socket.off('receive_message', handleMessage);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [eventId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    const text = input.trim();
    if (!socketRef.current || !text) return;
    socketRef.current.emit('send_message', {
      eventId,
      message: text,
      userId: currentUserId,
      username: currentUsername,
    });
    setInput('');
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--card-bg, var(--surface))',
    border: '1px solid var(--border)',
  };

  return (
    <div className="rounded-2xl shadow-sm overflow-hidden" style={cardStyle}>
      {/* Header */}
      <div
        className="px-6 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div>
          <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>
            💬 Чат события
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Общайся с другими участниками
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'
            }`}
          />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {connected ? 'Подключено' : 'Подключение...'}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div
        className="px-4 py-4 h-72 overflow-y-auto flex flex-col gap-2"
        style={{ background: 'var(--surface-2)' }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <span className="text-3xl">💬</span>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Пока никто ничего не написал
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Будь первым!
            </p>
          </div>
        ) : (
          messages.map((m, i) => {
            const isMe = String(m.userId) === String(currentUserId);
            return (
              <div
                key={i}
                className={`flex gap-2 ${
                  isMe ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                {!isMe && (
                  <Link
                    href={`/users/${m.userId}`}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 self-end transition hover:opacity-75 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      background:
                        'linear-gradient(135deg,var(--accent,#4f46e5),#9333ea)',
                    }}
                    title={m.username}
                    aria-label={`Профиль ${m.username}`}
                  >
                    {(m.username || m.userId).slice(0, 1).toUpperCase()}
                  </Link>
                )}

                <div
                  className={`max-w-xs lg:max-w-md px-3 py-2 rounded-2xl text-sm ${
                    isMe ? 'rounded-tr-sm' : 'rounded-tl-sm'
                  }`}
                  style={{
                    background: isMe
                      ? 'var(--accent-gradient, linear-gradient(135deg,#4f46e5,#7c3aed))'
                      : 'var(--surface)',
                    color: isMe ? '#fff' : 'var(--text)',
                    border: isMe ? 'none' : '1px solid var(--border)',
                  }}
                >
                  {!isMe && (
                    <Link
                      href={`/users/${m.userId}`}
                      className="text-xs font-semibold mb-0.5 opacity-70 block truncate max-w-[160px] transition hover:opacity-100 hover:underline"
                      style={{ color: 'inherit' }}
                      title={m.username}
                    >
                      {m.username || m.userId}
                    </Link>
                  )}
                  <p>{m.message}</p>
                  <p
                    className={`text-xs mt-1 ${
                      isMe ? 'text-white/60' : ''
                    }`}
                    style={isMe ? {} : { color: 'var(--text-muted)' }}
                  >
                    {new Date(m.timestamp).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="px-4 py-3 flex gap-2"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Написать сообщение... (Enter — отправить)"
          maxLength={500}
          className="flex-1 px-4 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || !connected}
          className="px-4 py-2 rounded-xl font-bold text-sm text-white hover:opacity-90 transition disabled:opacity-40"
          style={{
            background:
              'var(--accent-gradient, linear-gradient(135deg,#4f46e5,#7c3aed))',
          }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
