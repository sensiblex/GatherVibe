'use client';

import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { apiFetch } from '../../lib/apiFetch';
import { toast } from '../Toast';
import { resolveApiBase } from '../../lib/apiBase';

const API_BASE = resolveApiBase();

interface PollOption {
  id: number;
  text: string;
  vote_count: number;
}

interface Poll {
  id: number;
  party_id: number;
  question: string;
  status: 'active' | 'closed';
  created_by: number;
  created_by_username: string;
  created_at: string;
  closed_at: string | null;
  options: PollOption[];
  my_vote_option_id: number | null;
}

interface ActivePollProps {
  partyId: number;
  isCreator: boolean;
  currentUserId: number | null;
  socket: Socket | null;
}

function PollBar({ option, total, isWinner, isVoted }: {
  option: PollOption;
  total: number;
  isWinner: boolean;
  isVoted: boolean;
}) {
  const pct = total > 0 ? Math.round((option.vote_count / total) * 100) : 0;

  return (
    <div
      className="rounded-lg overflow-hidden relative"
      style={{
        background: isWinner
          ? 'var(--success-hl)'
          : isVoted
          ? 'var(--primary-hl)'
          : 'var(--surface-2)',
        border: isWinner
          ? '1px solid color-mix(in oklch, var(--success) 35%, transparent)'
          : isVoted
          ? '1px solid color-mix(in oklch, var(--primary) 35%, transparent)'
          : '1px solid var(--border)',
      }}
    >
      {/* Progress fill */}
      <div
        className="absolute inset-y-0 left-0 transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: isWinner
            ? 'color-mix(in oklch, var(--success) 18%, transparent)'
            : isVoted
            ? 'color-mix(in oklch, var(--primary) 15%, transparent)'
            : 'color-mix(in oklch, var(--border) 60%, transparent)',
        }}
      />
      <div className="relative flex items-center justify-between px-3 py-2 gap-2">
        <span
          className="text-sm font-medium truncate"
          style={{ color: isWinner ? 'var(--success)' : isVoted ? 'var(--primary)' : 'var(--text)' }}
        >
          {isWinner && '🏆 '}{option.text}
        </span>
        <span
          className="text-xs shrink-0 tabular-nums"
          style={{ color: 'var(--text-muted)' }}
        >
          {option.vote_count} гол. ({pct}%)
        </span>
      </div>
    </div>
  );
}

function PollCard({
  poll,
  isCreator,
  currentUserId,
  onVote,
  onClose,
  collapsible,
}: {
  poll: Poll;
  isCreator: boolean;
  currentUserId: number | null;
  onVote: (updatedPoll: Poll) => void;
  onClose: (updatedPoll: Poll) => void;
  collapsible?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(collapsible ?? false);
  const [voting, setVoting] = useState(false);
  const [closing, setClosing] = useState(false);

  const totalVotes = poll.options.reduce((sum, o) => sum + o.vote_count, 0);
  const maxVotes = Math.max(...poll.options.map((o) => o.vote_count), 0);
  const hasVoted = poll.my_vote_option_id !== null;
  const isClosed = poll.status === 'closed';
  const showBars = hasVoted || isClosed;

  const handleVote = async (optionId: number) => {
    if (hasVoted || isClosed || voting || !currentUserId) return;
    setVoting(true);
    try {
      const res = await apiFetch(`${API_BASE}/polls/${poll.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option_id: optionId }),
      });
      if (res.ok) {
        const updated: Poll = await res.json();
        // Pass the full updated poll so vote_counts are reflected immediately
        onVote(updated);
      } else {
        const d = await res.json();
        toast(d?.detail ?? 'Ошибка голосования', 'error');
      }
    } catch {
      toast('Ошибка сети', 'error');
    } finally {
      setVoting(false);
    }
  };

  const handleClose = async () => {
    if (!isCreator || isClosed || closing) return;
    setClosing(true);
    try {
      const res = await apiFetch(`${API_BASE}/polls/${poll.id}/close`, {
        method: 'POST',
      });
      if (res.ok) {
        const updated: Poll = await res.json();
        onClose(updated);
      } else {
        const d = await res.json();
        toast(d?.detail ?? 'Ошибка закрытия', 'error');
      }
    } catch {
      toast('Ошибка сети', 'error');
    } finally {
      setClosing(false);
    }
  };

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{
          borderBottom: collapsed ? 'none' : '1px solid var(--border)',
          background: isClosed ? 'var(--surface-2)' : 'var(--surface)',
        }}
      >
        <span className="text-base shrink-0">{isClosed ? '📊' : '📊'}</span>
        <button
          className="flex-1 text-left text-sm font-semibold truncate"
          style={{ color: 'var(--text)' }}
          onClick={() => collapsible && setCollapsed((v) => !v)}
        >
          {poll.question}
        </button>
        <div className="flex items-center gap-2 shrink-0">
          {isClosed ? (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: 'var(--surface-2)', color: 'var(--text-faint)', border: '1px solid var(--border)' }}
            >
              Завершено
            </span>
          ) : (
            <>
              {isCreator && (
                <button
                  onClick={handleClose}
                  disabled={closing}
                  className="text-xs px-2.5 py-1 rounded-lg font-medium transition hover:opacity-80 disabled:opacity-50"
                  style={{
                    background: 'var(--error-hl)',
                    color: 'var(--error)',
                    border: '1px solid color-mix(in oklch, var(--error) 30%, transparent)',
                  }}
                >
                  {closing ? '...' : 'Завершить'}
                </button>
              )}
            </>
          )}
          {collapsible && (
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="text-xs transition hover:opacity-70"
              style={{ color: 'var(--text-faint)' }}
              aria-label={collapsed ? 'Развернуть' : 'Свернуть'}
            >
              {collapsed ? '▼' : '▲'}
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 py-3 flex flex-col gap-2">
          {/* Options */}
          {poll.options.map((option) => {
            const isWinner =
              isClosed && option.vote_count === maxVotes && maxVotes > 0;
            const isVotedOption = poll.my_vote_option_id === option.id;

            if (showBars) {
              return (
                <PollBar
                  key={option.id}
                  option={option}
                  total={totalVotes}
                  isWinner={isWinner}
                  isVoted={isVotedOption}
                />
              );
            }

            // Unvoted active poll — clickable options
            return (
              <button
                key={option.id}
                onClick={() => handleVote(option.id)}
                disabled={voting || !currentUserId}
                className="text-left text-sm px-3 py-2 rounded-lg font-medium transition hover:opacity-80 disabled:opacity-50"
                style={{
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                }}
              >
                {option.text}
              </button>
            );
          })}

          {/* Footer meta */}
          <div className="flex items-center justify-between text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
            <span>{totalVotes} {totalVotes === 1 ? 'голос' : totalVotes < 5 ? 'голоса' : 'голосов'}</span>
            {isClosed && poll.closed_at && (
              <span>
                Закрыто{' '}
                {new Date(poll.closed_at).toLocaleString('ru-RU', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ActivePoll({ partyId, isCreator, currentUserId, socket }: ActivePollProps) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiFetch(`${API_BASE}/parties/${partyId}/polls`)
      .then(async (res) => {
        if (res.ok) {
          const data: Poll[] = await res.json();
          setPolls(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [partyId]);

  useEffect(() => {
    if (!socket) return;

    const upsertPoll = (updated: Poll) => {
      setPolls((prev) => {
        const idx = prev.findIndex((p) => p.id === updated.id);
        if (idx === -1) return [updated, ...prev];
        const next = [...prev];
        // Preserve my_vote_option_id from local state — socket payload reflects
        // the sender's vote, not necessarily the current viewer's vote.
        next[idx] = {
          ...updated,
          my_vote_option_id: prev[idx].my_vote_option_id ?? updated.my_vote_option_id,
        };
        return next;
      });
    };

    socket.on('poll_created', upsertPoll);
    socket.on('poll_voted', upsertPoll);
    socket.on('poll_closed', upsertPoll);

    return () => {
      socket.off('poll_created', upsertPoll);
      socket.off('poll_voted', upsertPoll);
      socket.off('poll_closed', upsertPoll);
    };
  }, [socket]);

  // Called with full updated Poll from REST response — immediately reflects vote_counts
  const handleVote = (updatedPoll: Poll) => {
    setPolls((prev) =>
      prev.map((p) => (p.id === updatedPoll.id ? updatedPoll : p))
    );
  };

  const handleClosePoll = (updatedPoll: Poll) => {
    setPolls((prev) =>
      prev.map((p) => (p.id === updatedPoll.id ? updatedPoll : p))
    );
  };

  const addOption = () => {
    if (options.length >= 10) return;
    setOptions((prev) => [...prev, '']);
  };

  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateOption = (idx: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === idx ? value : o)));
  };

  const resetForm = () => {
    setQuestion('');
    setOptions(['', '']);
    setShowCreate(false);
  };

  const handleCreate = async () => {
    const validOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) { toast('Введите вопрос', 'error'); return; }
    if (validOptions.length < 2) { toast('Добавьте минимум 2 варианта', 'error'); return; }

    setCreating(true);
    try {
      const res = await apiFetch(`${API_BASE}/parties/${partyId}/polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), options: validOptions }),
      });
      if (res.ok) {
        const created: Poll = await res.json();
        setPolls((prev) => [created, ...prev]);
        resetForm();
        toast('Голосование создано', 'success');
      } else {
        const d = await res.json();
        toast(d?.detail ?? 'Ошибка создания', 'error');
      }
    } catch {
      toast('Ошибка сети', 'error');
    } finally {
      setCreating(false);
    }
  };

  const activePolls = polls.filter((p) => p.status === 'active');
  const closedPolls = polls.filter((p) => p.status === 'closed');

  if (loading) {
    return (
      <div
        className="rounded-xl px-4 py-3 animate-pulse"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="h-4 w-40 rounded" style={{ background: 'var(--surface-2)' }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          📊 Голосования
        </span>
        {isCreator && !showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition hover:opacity-80"
            style={{
              background: 'var(--primary-hl)',
              color: 'var(--primary)',
              border: '1px solid color-mix(in oklch, var(--primary) 30%, transparent)',
            }}
          >
            + Создать голосование
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div
          className="rounded-xl p-4 flex flex-col gap-3"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Новое голосование</p>

          <input
            className="gv-input text-sm"
            placeholder="Вопрос..."
            maxLength={200}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />

          <div className="flex flex-col gap-2">
            {options.map((opt, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  className="gv-input text-sm flex-1"
                  placeholder={`Вариант ${idx + 1}`}
                  maxLength={100}
                  value={opt}
                  onChange={(e) => updateOption(idx, e.target.value)}
                />
                {options.length > 2 && (
                  <button
                    onClick={() => removeOption(idx)}
                    className="text-sm transition hover:opacity-70"
                    style={{ color: 'var(--error)' }}
                    aria-label="Удалить вариант"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <button
                onClick={addOption}
                className="text-xs px-3 py-1.5 rounded-lg self-start font-medium transition hover:opacity-80"
                style={{
                  background: 'var(--surface-2)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                }}
              >
                + Добавить вариант
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="text-sm px-4 py-2 rounded-lg font-semibold transition hover:opacity-90 disabled:opacity-50"
              style={{ background: 'var(--primary)', color: 'var(--text-inverse)' }}
            >
              {creating ? 'Создание...' : 'Создать'}
            </button>
            <button
              onClick={resetForm}
              disabled={creating}
              className="text-sm px-4 py-2 rounded-lg font-medium transition hover:opacity-80 disabled:opacity-50"
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Active polls */}
      {activePolls.map((poll) => (
        <PollCard
          key={poll.id}
          poll={poll}
          isCreator={isCreator}
          currentUserId={currentUserId}
          onVote={handleVote}
          onClose={handleClosePoll}
          collapsible={false}
        />
      ))}

      {/* Closed polls */}
      {closedPolls.length > 0 && (
        <div className="flex flex-col gap-2">
          {activePolls.length > 0 && (
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
              Завершённые
            </p>
          )}
          {closedPolls.map((poll) => (
            <PollCard
              key={poll.id}
              poll={poll}
              isCreator={isCreator}
              currentUserId={currentUserId}
              onVote={handleVote}
              onClose={handleClosePoll}
              collapsible
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {polls.length === 0 && !showCreate && (
        <div
          className="rounded-xl px-4 py-5 text-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-faint)' }}>
            Голосований пока нет
            {isCreator && ' — создайте первое!'}
          </p>
        </div>
      )}
    </div>
  );
}

