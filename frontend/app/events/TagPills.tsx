'use client';

import { TOP_TAGS, toggleTag } from './event-filters';

interface Props {
  selected: string[];
  onChange: (next: string[]) => void;
}

const TAG_LABELS: Record<string, string> = {
  'free': 'Бесплатные',
  'open air': 'Open air',
  'городские': 'Городские',
  'детям': 'Детям',
  'концерты': 'Концерты',
  'фестивали': 'Фестивали',
  'шоу': 'Шоу',
  'праздники': 'Праздники',
};

export default function TagPills({ selected, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Быстрые теги">
      {TOP_TAGS.map(tag => {
        const active = selected.includes(tag);
        return (
          <button
            key={tag}
            onClick={() => onChange(toggleTag(selected, tag))}
            aria-pressed={active}
            className="whitespace-nowrap font-semibold transition"
            style={{
              padding: '0.35rem 0.9rem',
              borderRadius: 'var(--r-full)',
              fontSize: '.75rem',
              background: active ? 'var(--primary)' : 'var(--surface-2)',
              color: active ? 'var(--text-inverse)' : 'var(--text-muted)',
              border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
              cursor: 'pointer',
              boxShadow: active ? '0 2px 8px var(--primary-ring)' : 'none',
            }}
          >
            #{TAG_LABELS[tag] ?? tag}
          </button>
        );
      })}
    </div>
  );
}
