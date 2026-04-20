'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Socket } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../lib/socket';
import { apiFetch } from '../lib/apiFetch';
import ReportButton from './ReportButton';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Message {
  messageId?: number;
  message: string;
  userId: string | number;
  username: string;
  timestamp: string;
  partyId: number;
  avatarUrl?: string | null;
  isSystem?: boolean;
  eventType?: string;
  fileUrl?: string | null;
  fileType?: string | null;
  fileName?: string | null;
  reactions?: Record<string, string[]>;
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
  const [uploading, setUploading] = useState(false);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAcceptedMember || !currentUserId || !token) return;

    apiFetch(`${API_BASE}/messages/party_${partyId}?limit=50`)
      .then(r => r.ok ? r.json() : { messages: [] })
      .then((data: { messages: Message[] } | Message[]) => {
        const raw = Array.isArray(data) ? data : (data.messages ?? []);
        const history = (raw as unknown as Array<Record<string, unknown>>).map((m) => ({
          ...m,
          messageId: (m.id ?? m.messageId) as number | undefined,
          userId: (m.userId ?? m.user_id) as number | undefined,
          timestamp: (m.timestamp ?? m.created_at) as string | undefined,
          isSystem: (m.isSystem ?? m.is_system ?? false) as boolean,
          eventType: (m.eventType ?? m.event_type ?? null) as string | null,
          fileUrl: (m.fileUrl ?? m.file_url ?? null) as string | null,
          fileType: (m.fileType ?? m.file_type ?? null) as string | null,
          fileName: (m.fileName ?? m.file_name ?? null) as string | null,
          reactions: (m.reactions ?? {}) as Record<string, string[]>,
        }));
        setMessages(history as Message[]);
        setHistoryLoaded(true);
      })
      .catch(() => setHistoryLoaded(true));

    const socket = getSocket();
    socketRef.current = socket;

    const join = () => {
      setConnected(true);
      // Auth — через cookie в WS-handshake.
      socket.emit('join_party_chat', { partyId });
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
      setMessages(prev => [...prev, { ...msg, reactions: msg.reactions ?? {} }]);
    };

    const onReactionUpdated = (data: { messageId: number; partyId: number; reactions: Record<string, string[]> }) => {
      setMessages(prev =>
        prev.map(m => m.messageId === data.messageId ? { ...m, reactions: data.reactions } : m)
      );
    };

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);
    socket.on('receive_party_message', onMessage);
    socket.on('party_reaction_updated', onReactionUpdated);

    return () => {
      socket.emit('leave_party_chat', { partyId });
      socket.off('connect', join);
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('disconnect', onDisconnect);
      socket.off('receive_party_message', onMessage);
      socket.off('party_reaction_updated', onReactionUpdated);
      socketRef.current = null;
    };
  }, [partyId, currentUserId, isAcceptedMember, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    if (!socketRef.current || !currentUserId || !token) return;
    if (!input.trim()) return;
    // Auth — через cookie в WS-handshake.
    socketRef.current.emit('send_party_message', {
      partyId,
      message: input.trim(),
    });
    setInput('');
  };

  const sendReaction = (messageId: number, emoji: string) => {
    if (!socketRef.current || !token) return;
    // Auth — через cookie в WS-handshake.
    socketRef.current.emit('add_party_reaction', { party_id: partyId, message_id: messageId, emoji });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !socketRef.current || !token) return;
    e.target.value = '';

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/upload/chat`, {
        method: 'POST',
        credentials: 'include',  // HttpOnly cookie auth
        body: form,
      });
      if (!res.ok) throw new Error('Upload failed');
      const { file_url, file_type, file_name } = await res.json() as {
        file_url: string;
        file_type: string;
        file_name: string;
      };
      // Auth — через cookie в WS-handshake.
      socketRef.current.emit('send_party_message', {
        partyId,
        message: input.trim(),
        file_url,
        file_type,
        file_name,
      });
      setInput('');
    } catch (err) {
      console.error('[PartyChat] File upload error:', err);
    } finally {
      setUploading(false);
    }
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
                <div key={i} className="flex items-center gap-2 my-1">
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                  <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>
                    {msg.message}
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
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
                onMouseEnter={() => msg.messageId != null && setHoveredId(msg.messageId)}
                onMouseLeave={() => setHoveredId(null)}
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

                  {/* Reaction picker + report on hover */}
                  {hoveredId === msg.messageId && msg.messageId != null && (
                    <div className={`flex gap-1 mb-1 items-center ${isOwn ? 'self-end' : 'self-start'}`}>
                      {['👍', '❤️', '😂'].map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => sendReaction(msg.messageId!, emoji)}
                          className="text-base rounded-full px-1.5 py-0.5 transition hover:scale-110"
                          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                        >
                          {emoji}
                        </button>
                      ))}
                      {!isOwn && (
                        <ReportButton
                          targetType="chat_message"
                          targetId={msg.messageId}
                          label="Пожаловаться"
                          compact
                        />
                      )}
                    </div>
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
                    {/* File preview — only serve files from our own uploads path */}
                    {msg.fileType === 'image' && msg.fileUrl?.startsWith('/uploads/chat/') && (
                      <img
                        src={`${API_BASE}${msg.fileUrl}`}
                        alt={msg.fileName ?? 'image'}
                        className="rounded-xl max-w-full mb-1 cursor-pointer"
                        style={{ maxHeight: '200px', objectFit: 'contain' }}
                        onClick={() => window.open(`${API_BASE}${msg.fileUrl}`, '_blank')}
                      />
                    )}
                    {msg.fileType && msg.fileType !== 'image' && msg.fileUrl?.startsWith('/uploads/chat/') && (
                      <a
                        href={`${API_BASE}${msg.fileUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs underline mb-1"
                        style={{ color: 'inherit', opacity: 0.85 }}
                      >
                        📎 {msg.fileName ?? 'файл'}
                      </a>
                    )}
                    {msg.message && <span>{msg.message}</span>}
                  </div>

                  {/* Reaction bar */}
                  {Object.keys(msg.reactions ?? {}).length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {Object.entries(msg.reactions!).map(([emoji, userIds]) => {
                        const isMine = currentUserId !== null && userIds.includes(String(currentUserId));
                        return (
                          <button
                            key={emoji}
                            onClick={() => msg.messageId != null && sendReaction(msg.messageId, emoji)}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs transition"
                            style={{
                              background: isMine ? 'rgba(99,102,241,0.15)' : 'var(--surface-2)',
                              border: isMine ? '1px solid rgba(99,102,241,0.4)' : '1px solid var(--border)',
                              color: 'var(--text)',
                            }}
                          >
                            {emoji} <span style={{ color: 'var(--text-muted)' }}>{userIds.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

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
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.zip"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Attachment button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!connected || uploading}
          className="rounded-xl px-3 py-2 text-base transition hover:opacity-75 disabled:opacity-40 shrink-0"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
          title="Прикрепить файл"
        >
          {uploading ? (
            <span
              className="inline-block w-4 h-4 rounded-full border-2 border-t-transparent animate-spin align-middle"
              style={{ borderColor: 'var(--text-muted)', borderTopColor: 'transparent' }}
            />
          ) : (
            '📎'
          )}
        </button>

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
          disabled={!connected || uploading}
        />
        <button
          onClick={send}
          disabled={!input.trim() || !connected || !token || uploading}
          className="rounded-xl px-4 py-2 text-sm text-white font-semibold disabled:opacity-40 hover:opacity-90 transition shrink-0"
          style={{ background: 'linear-gradient(135deg,#4f46e5,#9333ea)' }}
        >
          Отправить
        </button>
      </div>
    </div>
  );
}
