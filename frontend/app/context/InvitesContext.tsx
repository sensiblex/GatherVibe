'use client';

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getSocket } from '../lib/socket';
import { type PartyInvite, getMyInvites } from '../lib/partyInviteApi';

interface InvitesContextValue {
  invites: PartyInvite[];
  count: number;
  isLoaded: boolean;
  refresh: () => Promise<void>;
}

const InvitesContext = createContext<InvitesContextValue | null>(null);

export function InvitesProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [invites, setInvites] = useState<PartyInvite[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setInvites([]);
      setIsLoaded(true);
      return;
    }
    const data = await getMyInvites().catch(() => []);
    setInvites(data);
    setIsLoaded(true);
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    const onChanged = () => refresh();
    socket.on('party_invite_received', onChanged);
    socket.on('party_invite_cancelled', onChanged);
    socket.on('party_deleted_user', onChanged);
    window.addEventListener('party-invites:changed', onChanged);
    return () => {
      socket.off('party_invite_received', onChanged);
      socket.off('party_invite_cancelled', onChanged);
      socket.off('party_deleted_user', onChanged);
      window.removeEventListener('party-invites:changed', onChanged);
    };
  }, [token, refresh]);

  return (
    <InvitesContext.Provider value={{ invites, count: invites.length, isLoaded, refresh }}>
      {children}
    </InvitesContext.Provider>
  );
}

export function useInvites() {
  const ctx = useContext(InvitesContext);
  if (!ctx) throw new Error('useInvites must be used within InvitesProvider');
  return ctx;
}
