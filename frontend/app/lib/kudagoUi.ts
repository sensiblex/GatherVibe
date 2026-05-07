import { translateCategory } from '../events/utils';

export interface KudaGoEvent {
  kudago_id: number;
  title: string;
  short_title: string;
  description: string;
  categories: UnknownTagLike[];
  tags: UnknownTagLike[];
  price: string;
  is_free: boolean;
  age_restriction: string | number | null;
  is_permanent: boolean;
  start_date: string | null;
  start_time: string | null;
  place_title: string;
  place_address: string;
  lat: number | null;
  lon: number | null;
  cover_url: string | null;
  site_url: string;
}

export interface KudaGoParty {
  id: number;
  title: string;
  description: string | null;
  creator_id?: number;
  is_open?: boolean;
}

export type UnknownTagLike =
  | string
  | number
  | { name?: unknown; slug?: unknown; id?: unknown; title?: unknown }
  | null
  | undefined;

export function toLabel(value: UnknownTagLike): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const tag = value as { name?: unknown; slug?: unknown; id?: unknown; title?: unknown };
    if (tag.name !== undefined) return String(tag.name);
    if (tag.slug !== undefined) return String(tag.slug);
    if (tag.id !== undefined) return String(tag.id);
    if (tag.title !== undefined) return String(tag.title);
  }
  return '';
}

export function toKey(value: UnknownTagLike, index: number): string {
  const label = toLabel(value).trim();
  return label ? `${label}-${index}` : `item-${index}`;
}

export interface KudaGoCategoryBadge {
  slug: string;
  label: string;
  key: string;
}

export function getCategoryBadges(categories: UnknownTagLike[] | undefined, limit = 3): KudaGoCategoryBadge[] {
  if (!Array.isArray(categories)) return [];

  return categories
    .map((item, index) => {
      const label = translateCategory(toLabel(item));
      const slug = toLabel(item) || String(index);
      if (!label) return null;
      return {
        slug,
        label,
        key: toKey(item, index),
      };
    })
    .filter((item): item is KudaGoCategoryBadge => item !== null)
    .slice(0, limit);
}
