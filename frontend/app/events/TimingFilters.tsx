'use client';

interface Props {
  onlyVerifiedPlace: boolean;
  onChange: (patch: {
    onlyVerifiedPlace?: boolean;
  }) => void;
}

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

export default function TimingFilters({ onlyVerifiedPlace, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Площадка">
      <button aria-pressed={onlyVerifiedPlace} onClick={() => onChange({ onlyVerifiedPlace: !onlyVerifiedPlace })} style={chip(onlyVerifiedPlace)}>
        Проверенная площадка
      </button>
    </div>
  );
}
