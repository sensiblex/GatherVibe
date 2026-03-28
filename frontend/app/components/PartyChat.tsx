'use client';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Message {
  message: string;
  userId: string | number;
  username: string;
  timestamp: string;
  partyId: number;
}

interface Props {
  partyId: number;
  currentUserId: number | null;
  currentUsername: string | null;
  isAcceptedMember: boolean;
}

export default function PartyChat({ partyId, currentUserId, currentUsername, isAcceptedMember }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAcceptedMember || !currentUserId) return;

    const socket = io(API_BASE, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_party_chat', { partyId, userId: currentUserId });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('receive_party_message', (msg: Message) => {
      setMessages(prev => [...prev, msg]);
    });

    return () => {
      socket.emit('leave_party_chat', { partyId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [partyId, currentUserId, isAcceptedMember]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    if (!input.trim() || !socketRef.current || !currentUserId) return;
    socketRef.current.emit('send_party_message', {
      partyId,
      message: input.trim(),
      userId: currentUserId,
      username: currentUsername || 'Аноним',
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
          {connected && (
            <span className="text-xs text-indigo-200">• онлайн</span>
          )}
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
            const isOwn = currentUserId !== null && String(msg.userId) === String(currentUserId);
            return (
              <div
                key={i}
                className={`flex flex-col max-w-[75%] ${
                  isOwn ? 'self-end items-end' : 'self-start items-start'
                }`}
              >
                {!isOwn && (
                  <span className="text-xs text-gray-500 mb-0.5 px-1 font-semibold">
                    {msg.username}
                  </span>
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
          disabled={!input.trim() || !connected}
          className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm text-white font-semibold disabled:opacity-40 hover:opacity-90 transition shrink-0"
        >
          Отправить
        </button>
      </div>
    </div>
  );
}
