'use client';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function PlaceSearchInput({ value, onChange }: Props) {
  return (
    <div className="input-wrap" style={{ width: 220 }}>
      <svg className="input-ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Площадка или метро…"
        className="input input-padl"
        aria-label="Поиск по площадке или метро"
        style={{ fontSize: '.8125rem' }}
      />
    </div>
  );
}
