'use client';

interface Props {
  hasParty: boolean;
  hasFreeSpots: boolean;
  minAttendees: number | null;
  onChange: (next: { hasParty?: boolean; hasFreeSpots?: boolean; minAttendees?: number | null }) => void;
}

const ATTEND_THRESHOLDS = [
  { value: null, label: 'Любое' },
  { value: 5,    label: '5+ идут' },
  { value: 10,   label: '10+ идут' },
  { value: 25,   label: '25+ идут' },
];

function chip(on: boolean) {
  return {
    padding: '0.4rem 0.9rem',
    borderRadius: 'var(--r-full)',
    fontSize: '.8125rem',
    background: on ? 'var(--primary)' : 'var(--surface-2)',
    color: on ? 'var(--text-inverse)' : 'var(--text-muted)',
    border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
    cursor: 'pointer',
    fontWeight: 600,
    boxShadow: on ? '0 2px 8px var(--primary-ring)' : 'none',
  } as const;
}

export default function SocialFilters({ hasParty, hasFreeSpots, minAttendees, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Социальные фильтры">
      <button
        aria-pressed={hasParty}
        onClick={() => onChange({ hasParty: !hasParty })}
        style={chip(hasParty)}
      >
        Есть пати
      </button>
      <button
        aria-pressed={hasFreeSpots}
        onClick={() => onChange({ hasFreeSpots: !hasFreeSpots })}
        style={chip(hasFreeSpots)}
      >
        Есть места
      </button>
      {ATTEND_THRESHOLDS.map(opt => {
        const on = minAttendees === opt.value;
        return (
          <button
            key={String(opt.value)}
            aria-pressed={on}
            onClick={() => onChange({ minAttendees: opt.value })}
            style={chip(on)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
