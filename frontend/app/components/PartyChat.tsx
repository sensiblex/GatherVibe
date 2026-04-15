'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../lib/socket';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Message {
  message: string;
  userId: string | number;
  username: string;
  timestamp: string;
  partyId: number;
  avatarUrl?: string | null;
  isSystem?: boolean;
  eventType?: string;
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

    fetch(`${API_BASE}/messages/party_${partyId}?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { messages: [] })
      .then((data: { messages: Message[] } | Message[]) => {
        const raw = Array.isArray(data) ? data : (data.messages ?? []);
        const history = raw.map((m: any) => ({
          ...m,
          isSystem: m.isSystem ?? m.is_system ?? false,
          eventType: m.eventType ?? m.event_type ?? null,
        }));
        setMessages(history);
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));

    const socket = getSocket();
    socketRef.current = socket;

    const join = () => {
      setConnected(true);
      socket.emit('join_party_chat', { partyId, token });
    };

    if (socket.connected) {
      join();
    } else {
      socket.on('connect', join);
    }

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err: Error) => {
      console.error('[PartyChat] Socket.IO connect error:', err.message);
    };
    const onMessage = (msg: Message) => {
      setMessages(prev => [...prev, msg]);
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);
    socket.on('receive_party_message', onMessage);

    return () => {
      socket.emit('leave_party_chat', { partyId });
      socket.off('connect', join);
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('disconnect', onDisconnect);
      socket.off('receive_party_message', onMessage);
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
      <div className="rounded-xl p-4 text-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
        <p className="text-sm" style={{ color: 'var(--text-faint)' }}>💬 Чат доступен только участникам компании</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden" style={{ borderTop: '1px solid var(--border)' }}>
      {/* Connection indicator */}
      <div className="flex items-center justify-end gap-1.5 px-4 py-2" style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
        <span
          className={`w-1.5 h-1.5 rounded-full transition-colors ${connected ? 'bg-green-500' : 'bg-red-400'}`}
        />
        <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
          {connected ? 'онлайн' : 'соединение...'}
        </span>
      </div>

      {/* Messages */}
      <div
        className="h-[320px] overflow-y-auto p-4 flex flex-col gap-2"
        style={{ background: 'var(--bg)' }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <span className="text-3xl">💬</span>
            <p className="text-sm text-center" style={{ color: 'var(--text-faint)' }}>
              Сообщений пока нет.<br />Начните общение!
            </p>
          </div>
        ) : (
          messages.map((msg, i) => {
            if (msg.isSystem) {
              return (
                <div key={i} className="flex justify-center my-1">
                  <div
                    className="text-xs px-3 py-1.5 rounded-full text-center max-w-[80%]"
                    style={{
                      background: 'var(--surface-2)',
                      color: 'var(--text-faint)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {msg.message}
                  </div>
                </div>
              );
            }

            const isOwn =
              currentUserId !== null &&
              String(msg.userId) === String(currentUserId);
            return (
              <div
                key={i}
                className={`flex gap-2 items-end ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {!isOwn && (
                  <Link
                    href={`/users/${msg.userId}`}
                    className="w-7 h-7 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-white text-xs font-bold transition hover:opacity-75 hover:scale-110"
                    style={msg.avatarUrl ? undefined : { background: 'linear-gradient(135deg,#4f46e5,#9333ea)' }}
                    title={msg.username}
                    aria-label={`Профиль ${msg.username}`}
                  >
                    {msg.avatarUrl ? (
                      <img src={msg.avatarUrl} alt={msg.username} className="w-full h-full object-cover" />
                    ) : (
                      (msg.username || String(msg.userId)).slice(0, 1).toUpperCase()
                    )}
                  </Link>
                )}

                <div className={`flex flex-col max-w-[72%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  {!isOwn && (
                    <Link
                      href={`/users/${msg.userId}`}
                      className="text-xs mb-0.5 px-1 font-semibold transition hover:underline"
                      style={{ color: 'var(--text-muted)' }}
                      title={msg.username}
                    >
                      {msg.username}
                    </Link>
                  )}

                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                      isOwn ? 'rounded-br-sm' : 'rounded-bl-sm'
                    }`}
                    style={
                      isOwn
                        ? { background: 'linear-gradient(135deg,#4f46e5,#9333ea)', color: '#fff' }
                        : { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }
                    }
                  >
                    {msg.message}
                  </div>

                  <span className="text-[10px] mt-0.5 px-1" style={{ color: 'var(--text-faint)' }}>
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
      <div
        className="flex gap-2 px-4 py-3"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}
      >
        <input
          className="flex-1 rounded-xl px-3 py-2 text-sm outline-none transition"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
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
          className="rounded-xl px-4 py-2 text-sm text-white font-semibold disabled:opacity-40 hover:opacity-90 transition shrink-0"
          style={{ background: 'linear-gradient(135deg,#4f46e5,#9333ea)' }}
        >
          Отправить
        </button>
      </div>
    </div>
  );
}
