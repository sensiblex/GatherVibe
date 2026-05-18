'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getRecap, createNote, uploadPhoto, deleteRecapItem,
  pinHighlight, setRecapCover, reactToItem, unreactToItem,
  PartyRecapData, RecapItem, LifecycleStatus,
} from '../lib/partyRecapApi';
import { toast } from './Toast';
import { resolveApiBase } from '../lib/apiBase';

const API_BASE = resolveApiBase();
const REACTION_EMOJIS = ['🔥', '❤️', '😂', '👏', '🎉', '✨'];

interface Props {
  partyId: number;
  isCreator: boolean;
  myUserId: number | null;
}

const lifecycleLabel: Record<LifecycleStatus, { label: string; tone: string }> = {
  planned:  { label: 'Запланировано', tone: 'var(--text-muted)' },
  active:   { label: 'Идёт сейчас',    tone: 'var(--success)' },
  ended:    { label: 'Завершено',       tone: 'var(--primary)' },
  archived: { label: 'Архив',           tone: 'var(--text-faint)' },
};

function mediaUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}

export default function PartyRecapTab({ partyId, isCreator, myUserId }: Props) {
  const [recap, setRecap] = useState<PartyRecapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [posting, setPosting] = useState(false);
  const [lightboxId, setLightboxId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecapItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    const r = await getRecap(partyId);
    setRecap(r);
    setLoading(false);
  }, [partyId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading) {
    return (
      <div className="rounded-2xl p-6 animate-pulse"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="h-5 w-40 rounded mb-4" style={{ background: 'var(--surface-2)' }} />
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="aspect-square rounded-xl"
            style={{ background: 'var(--surface-2)' }} />)}
        </div>
      </div>
    );
  }

  if (!recap) {
    return <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
      Нет доступа к воспоминаниям компании.
    </div>;
  }

  const { lifecycle_status, can_post, items, highlights, cover_url } = recap;
  const lc = lifecycleLabel[lifecycle_status];

  const handleNote = async () => {
    if (!noteText.trim()) return;
    setPosting(true);
    const created = await createNote(partyId, noteText.trim());
    if (created) { toast('Заметка добавлена', 'success'); setNoteText(''); refresh(); }
    else toast('Не удалось добавить', 'error');
    setPosting(false);
  };

  const handlePhoto = async (file: File) => {
    setPosting(true);
    const created = await uploadPhoto(partyId, file);
    if (created) { toast('Фото загружено', 'success'); refresh(); }
    else toast('Не удалось загрузить фото', 'error');
    setPosting(false);
  };

  const handleDelete = async (item: RecapItem) => {
    setDeleteTarget(item);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const ok = await deleteRecapItem(partyId, deleteTarget.id);
    if (ok) { refresh(); setDeleteTarget(null); }
  };

  const handlePin = async (item: RecapItem) => {
    const ok = await pinHighlight(partyId, item.id, !item.is_pinned_highlight);
    if (ok) refresh();
    else toast('Не удалось закрепить (макс. 5)', 'error');
  };

  const handleReact = async (item: RecapItem, emoji: string) => {
    const has = item.my_reactions.includes(emoji);
    const ok = has
      ? await unreactToItem(partyId, item.id, emoji)
      : await reactToItem(partyId, item.id, emoji);
    if (ok) refresh();
  };

  const handleSetCover = async (url: string) => {
    const r = await setRecapCover(partyId, url);
    if (r) { setRecap(r); toast('Обложка обновлена', 'success'); }
  };

  const card: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-sm)',
  };

  return (
    <div className="space-y-6" data-testid="recap-tab">
      {/* Header / cover */}
      <div className="rounded-2xl overflow-hidden" style={card}>
        {cover_url && (
          <div className="aspect-[3/1] overflow-hidden">
            <img src={mediaUrl(cover_url)!} alt="cover"
              className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-5 flex items-center gap-3 flex-wrap">
          <h2 className="font-bold text-lg" style={{ color: 'var(--text)' }}>Воспоминания</h2>
          <span className="text-xs font-semibold px-2 py-1 rounded-full"
            style={{ background: 'var(--surface-2)', color: lc.tone, border: '1px solid var(--border)' }}>
            {lc.label}
          </span>
          {!can_post && lifecycle_status !== 'ended' && (
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
              {lifecycle_status === 'planned' && 'Постинг откроется после события'}
              {lifecycle_status === 'active' && 'Постинг откроется через 2 часа после старта'}
              {lifecycle_status === 'archived' && 'Окно для добавления закрыто (только просмотр)'}
            </span>
          )}
        </div>
      </div>

      {/* Highlights */}
      {highlights.length > 0 && (
        <div className="rounded-2xl p-5" style={card}>
          <h3 className="font-bold mb-3 text-sm uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Лучшие моменты
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {highlights.map(it => (
              <RecapCard key={`hl-${it.id}`} item={it} compact
                isCreator={isCreator} myUserId={myUserId}
                onDelete={handleDelete} onPin={handlePin} onReact={handleReact}
                onSetCover={handleSetCover} onOpenPhoto={() => setLightboxId(it.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Uploader */}
      {can_post && (
        <div className="rounded-2xl p-5 space-y-3" style={card} data-testid="recap-uploader">
          <h3 className="font-bold" style={{ color: 'var(--text)' }}>Поделиться моментом</h3>
          <textarea
            className="gv-input w-full resize-none"
            rows={3}
            maxLength={500}
            placeholder="Напишите заметку…"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            data-testid="recap-note-input"
          />
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleNote}
              disabled={posting || !noteText.trim()}
              data-testid="recap-post-note"
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm text-white font-bold hover:opacity-90 transition disabled:opacity-50">
              Опубликовать
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              data-testid="recap-photo-input"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handlePhoto(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={posting}
              data-testid="recap-upload-photo"
              className="rounded-xl px-4 py-2 text-sm font-bold transition hover:opacity-80 disabled:opacity-50"
              style={{ border: '1px solid var(--border)', color: 'var(--text)', background: 'var(--surface-2)' }}>
              Загрузить фото
            </button>
          </div>
        </div>
      )}

      {/* Feed */}
      <div className="rounded-2xl p-5" style={card}>
        <h3 className="font-bold mb-3 text-base" style={{ color: 'var(--text)' }}>
          Все воспоминания {items.length > 0 && (
            <span className="text-sm font-normal" style={{ color: 'var(--text-faint)' }}>· {items.length}</span>
          )}
        </h3>
        {items.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: 'var(--text-faint)' }}>
            Пока никто ничего не добавил. {can_post && 'Будьте первым!'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(it => (
              <RecapCard key={it.id} item={it}
                isCreator={isCreator} myUserId={myUserId}
                onDelete={handleDelete} onPin={handlePin} onReact={handleReact}
                onSetCover={handleSetCover} onOpenPhoto={() => setLightboxId(it.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxId !== null && (
        <RecapLightbox
          items={items.filter(i => i.kind === 'photo' && i.media_url)}
          activeId={lightboxId}
          onChange={setLightboxId}
          onClose={() => setLightboxId(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
          >
            <div className="px-6 py-4 bg-gradient-to-r from-red-500 to-pink-600 flex items-center justify-between">
              <h3 className="text-white font-black text-base">Удалить пост?</h3>
              <button onClick={() => setDeleteTarget(null)} className="text-white/70 hover:text-white transition text-xl">✕</button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm" style={{ color: 'var(--text)' }}>
                Вы уверены, что хотите удалить этот пост? Это действие нельзя отменить.
              </p>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={confirmDelete}
                className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-pink-600 py-2.5 text-sm text-white font-bold hover:opacity-90 transition">
                Удалить
              </button>
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-xl px-4 py-2.5 text-sm font-medium transition hover:opacity-80"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Card ──────────────────────────────────────────────────────────────────

function RecapCard({
  item, isCreator, myUserId, compact = false,
  onDelete, onPin, onReact, onSetCover, onOpenPhoto,
}: {
  item: RecapItem;
  isCreator: boolean;
  myUserId: number | null;
  compact?: boolean;
  onDelete: (i: RecapItem) => void;
  onPin: (i: RecapItem) => void;
  onReact: (i: RecapItem, emoji: string) => void;
  onSetCover: (url: string) => void;
  onOpenPhoto?: () => void;
}) {
  const isAuthor = myUserId !== null && item.author_id === myUserId;
  const canDelete = isAuthor || isCreator;
  const photo = mediaUrl(item.media_url);

  return (
    <div className="rounded-xl overflow-hidden flex flex-col"
      data-testid={`recap-item-${item.id}`}
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      {photo && (
        <button
          type="button"
          onClick={onOpenPhoto}
          data-testid={`recap-photo-open-${item.id}`}
          className={(compact ? 'aspect-square' : 'aspect-[4/3]') + ' overflow-hidden block w-full cursor-zoom-in group'}
          aria-label="Открыть фото"
        >
          <img src={photo} alt={item.caption ?? ''}
            className="w-full h-full object-cover transition group-hover:scale-[1.03]" />
        </button>
      )}
      <div className="p-3 flex-1 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-base" style={{ color: 'var(--text-muted)' }}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-sm text-white font-bold">
            {item.author_username.slice(0, 2).toUpperCase()}
          </div>
          <span className="font-semibold truncate">{item.author_username}</span>
          <span style={{ color: 'var(--text-faint)' }}>
            {new Date(item.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {item.caption && (
          <p className="text-base" style={{ color: 'var(--text)' }}>{item.caption}</p>
        )}
        <div className="flex items-center gap-1.5 flex-wrap mt-auto">
          {REACTION_EMOJIS.map(emoji => {
            const count = item.reactions[emoji] ?? 0;
            const mine  = item.my_reactions.includes(emoji);
            return (
              <button key={emoji}
                onClick={() => onReact(item, emoji)}
                className="text-base px-3 py-2 rounded-full transition hover:opacity-80"
                style={{
                  background: mine ? 'var(--primary-hl)' : 'var(--surface)',
                  border: '1px solid var(--border)',
                  color: mine ? 'var(--primary)' : 'var(--text-muted)',
                }}>
                {emoji}{count > 0 && <span className="ml-1 font-bold">{count}</span>}
              </button>
            );
          })}
        </div>
        {(isCreator || canDelete) && (
          <div className="flex items-center gap-1 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
            {isCreator && (
              <button onClick={() => onPin(item)}
                data-testid={`recap-pin-${item.id}`}
                className="text-sm px-3 py-1.5 rounded-md transition hover:opacity-80"
                style={{
                  color: item.is_pinned_highlight ? 'var(--primary)' : 'var(--text-faint)',
                  background: item.is_pinned_highlight ? 'var(--primary-hl)' : 'transparent',
                }}>
                {item.is_pinned_highlight ? 'Закреплено' : 'Закрепить'}
              </button>
            )}
            {isCreator && photo && (
              <button onClick={() => onSetCover(item.media_url!)}
                className="text-sm px-3 py-1.5 rounded-md transition hover:opacity-80"
                style={{ color: 'var(--text-faint)' }}>
                Обложка
              </button>
            )}
            {canDelete && (
              <button onClick={() => onDelete(item)}
                data-testid={`recap-delete-${item.id}`}
                className="ml-auto text-sm px-3 py-1.5 rounded-md transition hover:opacity-80"
                style={{ color: 'var(--error)', border: '1px solid color-mix(in oklch, var(--error) 30%, transparent)' }}>
                Удалить
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Lightbox ──────────────────────────────────────────────────────────────

function RecapLightbox({
  items, activeId, onChange, onClose,
}: {
  items: RecapItem[];
  activeId: number;
  onChange: (id: number) => void;
  onClose: () => void;
}) {
  const idx = Math.max(0, items.findIndex(i => i.id === activeId));
  const item = items[idx];

  const go = useCallback((delta: number) => {
    if (items.length === 0) return;
    const next = (idx + delta + items.length) % items.length;
    onChange(items[next].id);
  }, [idx, items, onChange]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  if (!item || !item.media_url) return null;
  const photo = mediaUrl(item.media_url);
  const hasMany = items.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
      data-testid="recap-lightbox"
      role="dialog"
      aria-modal="true"
    >
      {/* Close */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        data-testid="recap-lightbox-close"
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center text-white text-xl transition hover:bg-white/20"
        style={{ background: 'rgba(255,255,255,0.1)' }}
        aria-label="Закрыть"
      >✕</button>

      {/* Counter */}
      {hasMany && (
        <div className="absolute top-5 left-5 z-10 text-white/80 text-sm font-medium px-3 py-1.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.1)' }}>
          {idx + 1} / {items.length}
        </div>
      )}

      {/* Prev */}
      {hasMany && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); go(-1); }}
          data-testid="recap-lightbox-prev"
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full flex items-center justify-center text-white text-2xl transition hover:bg-white/20"
          style={{ background: 'rgba(255,255,255,0.1)' }}
          aria-label="Предыдущее"
        >‹</button>
      )}

      {/* Next */}
      {hasMany && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); go(1); }}
          data-testid="recap-lightbox-next"
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full flex items-center justify-center text-white text-2xl transition hover:bg-white/20"
          style={{ background: 'rgba(255,255,255,0.1)' }}
          aria-label="Следующее"
        >›</button>
      )}

      {/* Image */}
      <div
        className="max-w-[92vw] max-h-[92vh] flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={photo!}
          alt={item.caption ?? ''}
          className="max-w-[92vw] max-h-[80vh] object-contain rounded-xl"
          style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}
        />
        <div className="text-center text-white/90 max-w-[92vw]">
          <p className="text-sm font-semibold">
            {item.author_username}
            <span className="ml-2 text-white/60 font-normal">
              {new Date(item.created_at).toLocaleString('ru-RU', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </p>
          {item.caption && (
            <p className="text-sm mt-1 text-white/80 italic">{item.caption}</p>
          )}
        </div>
      </div>
    </div>
  );
}

