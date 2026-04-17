'use client';

import { useEffect, useRef, useState } from 'react';

interface Category { slug: string; name: string; }

interface CategoryPillsProps {
  categories: Category[];
  selected: string[];
  /** slug='' toggles to «Все» (empty selection). Otherwise toggles the given slug. */
  onToggle: (slug: string) => void;
}

export default function CategoryPills({ categories, selected, onToggle }: CategoryPillsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft]   = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  function updateArrows() {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }

  useEffect(() => {
    updateArrows();
    const onResize = () => updateArrows();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [categories]);

  function scrollBy(px: number) {
    scrollRef.current?.scrollBy({ left: px, behavior: 'smooth' });
  }

  const all: Category[] = [{ slug: '', name: 'Все' }, ...categories];

  return (
    <div
      className="relative flex items-center gap-1"
      style={{ flex: 1, minWidth: 0, maxWidth: '100%' }}
    >
      {/* Left fade + arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scrollBy(-200)}
          className="absolute left-0 z-10 flex items-center justify-center w-8 h-8 rounded-full transition hover:scale-110"
          style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          aria-label="Прокрутить влево"
        >‹</button>
      )}

      {/* Scrollable pills */}
      <div
        ref={scrollRef}
        onScroll={updateArrows}
        className="flex items-center gap-2 overflow-x-auto cat-pills-scroll"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          paddingLeft: canScrollLeft ? 36 : 0,
          paddingRight: canScrollRight ? 36 : 0,
          flex: 1,
          minWidth: 0,
          scrollBehavior: 'smooth',
        }}
      >
        {all.map(cat => {
          const isActive = cat.slug === '' ? selected.length === 0 : selected.includes(cat.slug);
          return (
            <button
              key={cat.slug}
              onClick={() => onToggle(cat.slug)}
              className="whitespace-nowrap text-sm font-semibold transition"
              style={{
                padding: '0.5rem 1.125rem',
                borderRadius: 'var(--r-full)',
                background: isActive ? 'var(--primary)' : 'var(--surface-2)',
                color: isActive ? 'var(--text-inverse)' : 'var(--text-muted)',
                border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                flexShrink: 0,
                transform: isActive ? 'scale(1.04)' : 'scale(1)',
                boxShadow: isActive ? '0 2px 10px var(--primary-ring)' : 'none',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--primary-hl)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--primary)';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
                }
              }}
            >
              {cat.name}
            </button>
          );
        })}
      </div>

      {/* Right fade + arrow */}
      {canScrollRight && (
        <button
          onClick={() => scrollBy(200)}
          className="absolute right-0 z-10 flex items-center justify-center w-8 h-8 rounded-full transition hover:scale-110"
          style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        >›</button>
      )}
    </div>
  );
}
