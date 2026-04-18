import { apiFetch } from './apiFetch';

export type LifecycleStatus = 'planned' | 'active' | 'ended' | 'archived';

export interface RecapItem {
  id: number;
  author_id: number;
  author_username: string;
  author_avatar_url: string | null;
  kind: 'photo' | 'note';
  media_url: string | null;
  caption: string | null;
  is_pinned_highlight: boolean;
  created_at: string;
  reactions: Record<string, number>;
  my_reactions: string[];
}

export interface PartyRecapData {
  party_id: number;
  cover_url: string | null;
  lifecycle_status: LifecycleStatus;
  can_post: boolean;
  items: RecapItem[];
  highlights: RecapItem[];
}

export async function getRecap(partyId: number): Promise<PartyRecapData | null> {
  const res = await apiFetch(`/parties/${partyId}/recap`);
  if (!res.ok) return null;
  return res.json();
}

export async function createNote(partyId: number, caption: string): Promise<RecapItem | null> {
  const res = await apiFetch(`/parties/${partyId}/recap/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'note', caption }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function uploadPhoto(partyId: number, file: File, caption?: string): Promise<RecapItem | null> {
  const fd = new FormData();
  fd.append('file', file);
  if (caption) fd.append('caption', caption);
  const res = await apiFetch(`/parties/${partyId}/recap/photo`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) return null;
  return res.json();
}

export async function deleteRecapItem(partyId: number, itemId: number): Promise<boolean> {
  const res = await apiFetch(`/parties/${partyId}/recap/items/${itemId}`, { method: 'DELETE' });
  return res.ok;
}

export async function pinHighlight(partyId: number, itemId: number, pin: boolean): Promise<boolean> {
  const res = await apiFetch(`/parties/${partyId}/recap/items/${itemId}/pin`, {
    method: pin ? 'POST' : 'DELETE',
  });
  return res.ok;
}

export async function setRecapCover(partyId: number, coverUrl: string | null): Promise<PartyRecapData | null> {
  const res = await apiFetch(`/parties/${partyId}/recap/cover`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cover_url: coverUrl }),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function reactToItem(partyId: number, itemId: number, emoji: string): Promise<boolean> {
  const res = await apiFetch(`/parties/${partyId}/recap/items/${itemId}/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emoji }),
  });
  return res.ok;
}

export async function unreactToItem(partyId: number, itemId: number, emoji: string): Promise<boolean> {
  const res = await apiFetch(`/parties/${partyId}/recap/items/${itemId}/react?emoji=${encodeURIComponent(emoji)}`, {
    method: 'DELETE',
  });
  return res.ok;
}
