'use client';

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

type Message = {
  message: string;
  userId: string;
  timestamp: string;
};

let socket: Socket | null = null;

export default function SiteChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [userId, setUserId] = useState<string>('guest');

  useEffect(() => {
    // берём юзера из localStorage или делай по-своему
    const storedUser = localStorage.getItem('username') || 'guest';
    setUserId(storedUser);

    // один общий socket для сайта
    if (!socket) {
      socket = io('http://127.0.0.1:8000'); // твой backend
    }

    socket.on('connect', () => {
      console.log('✅ connected', socket?.id);
      // общий чат — одна комната, например "global"
      socket?.emit('join_event_chat', 'global');
    });

    socket.on('receive_message', (data: Message) => {
      setMessages(prev => [...prev, data]);
    });

    return () => {
      socket?.off('receive_message');
    };
  }, []);

  const sendMessage = () => {
    if (!socket || !input.trim()) return;

    socket.emit('send_message', {
      eventId: 'global',           // та же "комната" что в join_event_chat
      message: input,
      userId,
    });

    setInput('');
  };

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white shadow-lg rounded-lg border flex flex-col">
      <div className="px-3 py-2 border-b font-semibold text-sm">
        Общий чат GatherVibe
      </div>
      <div className="p-2 h-64 overflow-y-auto text-sm space-y-1">
        {messages.map((m, i) => (
          <div key={i}>
            <span className="font-semibold">{m.userId}: </span>
            <span>{m.message}</span>
          </div>
        ))}
      </div>
      <div className="p-2 border-t flex gap-2">
        <input
          className="flex-1 border rounded px-2 py-1 text-sm"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Написать сообщение..."
        />
        <button
          onClick={sendMessage}
          className="px-3 py-1 bg-blue-500 text-white text-sm rounded"
        >
          ▶
        </button>
      </div>
    </div>
  );
}
