'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
/** Socket.IO подключается напрямую к backend (CORS разрешён) */
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:8000';

interface Message {
  message: string;
  userId: string | number;
  username: string;
  timestamp: string;
  partyId: number;
  avatarUrl?: string | null;
}

interface Props {
  partyId: number;
  currentUserId: number | null;
  currentUsername: string | null;
  isAcceptedMember: boolean;
}

export default function PartyChat({
  partyId,
  currentUserId,
  currentUsername,
  isAcceptedMember,
}: Props) {
  const { token } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAcceptedMember || !currentUserId || !token) return;

    // Load history
    fetch(`${API_BASE}/messages/party_${partyId}?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { messages: [] })
      .then((data: { messages: Message[] } | Message[]) => {
        // API вернул { messages, has_more, oldest_id } — берём поле messages
        const history = Array.isArray(data) ? data : data.messages ?? [];
        setMessages(history);
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));

    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      // Pass token so backend can authenticate the user
      socket.emit('join_party_chat', { partyId, token });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('receive_party_message', (msg: Message) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => {
      socket.emit('leave_party_chat', { partyId });
      socket.off('connect');
      socket.off('disconnect');
      socket.off('receive_party_message');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [partyId, currentUserId, isAcceptedMember, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    if (!input.trim() || !socketRef.current || !currentUserId || !token) return;
    socketRef.current.emit('send_party_message', {
      partyId,
      message: input.trim(),
      token,
    });
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!isAcceptedMember) {
    return (
      <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-center">
        <p className="text-sm text-gray-400">💬 Чат доступен только участникам компании</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-3xl border border-gray-100 shadow-sm bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-sm">💬 Чат компании</span>
          {connected && <span className="text-xs text-indigo-200">• онлайн</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              connected ? 'bg-green-400' : 'bg-red-400'
            }`}
          />
          <span className="text-xs text-indigo-200">
            {connected ? 'подключено' : 'соединение...'}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="h-[320px] overflow-y-auto p-4 flex flex-col gap-2 bg-gray-50/30">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <span className="text-3xl">💬</span>
            <p className="text-sm text-gray-400 text-center">
              Сообщений пока нет.<br />Начните общение!
            </p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOwn =
              currentUserId !== null &&
              String(msg.userId) === String(currentUserId);
            return (
              <div
                key={i}
                className={`flex gap-2 items-end ${
                  isOwn ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                {!isOwn && (
                  <Link
                    href={`/users/${msg.userId}`}
                    className="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-white text-xs font-bold transition hover:opacity-75 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={msg.avatarUrl ? undefined : { background: 'linear-gradient(135deg,#4f46e5,#9333ea)' }}
                    title={msg.username}
                    aria-label={`Профиль ${msg.username}`}
                  >
                    {msg.avatarUrl ? (
                      <img
                        src={msg.avatarUrl}
                        alt={msg.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      (msg.username || String(msg.userId)).slice(0, 1).toUpperCase()
                    )}
                  </Link>
                )}

                <div
                  className={`flex flex-col max-w-[72%] ${
                    isOwn ? 'items-end' : 'items-start'
                  }`}
                >
                  {!isOwn && (
                    <Link
                      href={`/users/${msg.userId}`}
                      className="text-xs text-gray-500 mb-0.5 px-1 font-semibold transition hover:text-indigo-600 hover:underline"
                      title={msg.username}
                    >
                      {msg.username}
                    </Link>
                  )}

                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                      isOwn
                        ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-br-sm'
                        : 'bg-white text-gray-800 border border-gray-100 shadow-sm rounded-bl-sm'
                    }`}
                  >
                    {msg.message}
                  </div>

                  <span className="text-[10px] text-gray-400 mt-0.5 px-1">
                    {new Date(msg.timestamp).toLocaleTimeString('ru-RU', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 px-4 py-3 border-t border-gray-100 bg-white">
        <input
          className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50"
          placeholder="Написать сообщение..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={500}
          disabled={!connected}
        />
        <button
          onClick={send}
          disabled={!input.trim() || !connected || !token}
          className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm text-white font-semibold disabled:opacity-40 hover:opacity-90 transition shrink-0"
        >
          Отправить
        </button>
      </div>
    </div>
  );
}
