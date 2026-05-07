import { apiFetch } from './apiFetch';

export interface PartyInvite {
  id: number;
  party_id: number;
  party_title: string;
  party_event_id: string;
  event_date_ts: number | null;
  event_image_url: string | null;
  creator_id: number;
  creator_username: string;
  invite_message: string | null;
  created_at: string;
}

export async function sendInvite(partyId: number, userId: number, message?: string): Promise<Response> {
  return apiFetch(`/parties/${partyId}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, message: message ?? null }),
  });
}

export async function acceptInvite(partyId: number, inviteId: number): Promise<Response> {
  return apiFetch(`/parties/${partyId}/invites/${inviteId}/accept`, { method: 'POST' });
}

export async function declineInvite(partyId: number, inviteId: number): Promise<Response> {
  return apiFetch(`/parties/${partyId}/invites/${inviteId}/decline`, { method: 'POST' });
}

export async function cancelInvite(partyId: number, inviteId: number): Promise<Response> {
  return apiFetch(`/parties/${partyId}/invites/${inviteId}`, { method: 'DELETE' });
}

export async function getMyInvites(): Promise<PartyInvite[]> {
  const res = await apiFetch('/users/me/party-invites');
  if (!res.ok) return [];
  return res.json();
}
