'use client';

import { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { apiFetch } from '../../lib/apiFetch';
import { toast } from '../Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface PinnedBlock {
  id: number;
  party_id: number;
  content: string;
  updated_by: number;
  updated_by_username: string;
  updated_at: string;
}

interface PinnedBlockProps {
  partyId: number;
  isCreator: boolean;
  socket: Socket | null;
}

export default function PinnedBlock({ partyId, isCreator, socket }: PinnedBlockProps) {
  const [pinned, setPinned] = useState<PinnedBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    apiFetch(`${API_BASE}/parties/${partyId}/pinned`)
      .then(async (res) => {
        if (res.status === 404) {
          setPinned(null);
        } else if (res.ok) {
          const data: PinnedBlock = await res.json();
          setPinned(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [partyId]);

  useEffect(() => {
    if (!socket) return;

    const onPinnedUpdated = (data: PinnedBlock) => {
      setPinned(data);
    };

    socket.on('pinned_updated', onPinnedUpdated);

    return () => {
      socket.off('pinned_updated', onPinnedUpdated);
    };
  }, [socket]);

  const startEdit = () => {
    setDraft(pinned?.content ?? '');
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft('');
  };

  const handleSave = async () => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/parties/${partyId}/pinned`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft.trim() }),
      });
      if (res.ok) {
        const data: PinnedBlock = await res.json();
        setPinned(data);
        setEditing(false);
        setDraft('');
      } else {
        const d = await res.json();
        toast(d?.detail ?? 'Ошибка сохранения', 'error');
      }
    } catch {
      toast('Ошибка сети', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        className="rounded-xl px-4 py-3 animate-pulse"
        style={{ background: 'var(--warning-hl)', border: '1px solid color-mix(in oklch, var(--warning) 25%, transparent)' }}
      >
        <div className="h-4 rounded w-2/3" style={{ background: 'color-mix(in oklch, var(--warning) 20%, transparent)' }} />
      </div>
    );
  }

  if (!pinned && !isCreator) return null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--warning-hl)',
        border: '1px solid color-mix(in oklch, var(--warning) 30%, transparent)',
      }}
    >
      {/* Header row */}
      <div className="flex items-start gap-2.5 px-4 py-3">
        <span className="text-base shrink-0 mt-0.5">📌</span>

        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                ref={textareaRef}
                className="gv-input resize-none text-sm w-full"
                rows={3}
                maxLength={500}
                placeholder="Введите закреплённое сообщение..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !draft.trim()}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold transition disabled:opacity-50 hover:opacity-90"
                  style={{
                    background: 'var(--warning)',
                    color: '#fff',
                  }}
                >
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50 hover:opacity-80"
                  style={{
                    background: 'var(--surface)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : pinned ? (
            <>
              <p className="text-sm leading-snug break-words" style={{ color: 'var(--text)' }}>
                {pinned.content}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Обновил: <span className="font-semibold">{pinned.updated_by_username}</span>
                {' · '}
                {new Date(pinned.updated_at).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </>
          ) : (
            <p className="text-sm italic" style={{ color: 'var(--text-muted)' }}>
              Нет закрепа
            </p>
          )}
        </div>

        {isCreator && !editing && (
          <button
            onClick={startEdit}
            className="shrink-0 text-base transition hover:scale-110 hover:opacity-80"
            title="Редактировать закреп"
            aria-label="Редактировать закреп"
          >
            ✏️
          </button>
        )}
      </div>

      {/* Creator CTA when no pinned exists */}
      {!pinned && isCreator && !editing && (
        <div
          className="px-4 pb-3"
        >
          <button
            onClick={startEdit}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition hover:opacity-80"
            style={{
              background: 'var(--surface)',
              color: 'var(--warning)',
              border: '1px solid color-mix(in oklch, var(--warning) 40%, transparent)',
            }}
          >
            + Закрепить сообщение
          </button>
        </div>
      )}
    </div>
  );
}
