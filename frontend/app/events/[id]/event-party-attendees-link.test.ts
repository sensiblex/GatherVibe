import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Event page wiring: Party -> Attendees invite context', () => {
  it('passes creator party context from EventParty to EventAttendees', () => {
    const sourcePath = resolve(process.cwd(), 'app/events/[id]/page.tsx');
    const source = readFileSync(sourcePath, 'utf-8');

    expect(source).toContain('creatorPartyContext');
    expect(source).toContain('onCreatorPartyChange={setCreatorPartyContext}');
    expect(source).toContain('partyId={creatorPartyContext?.partyId ?? null}');
    expect(source).toContain('partyMembers={creatorPartyContext?.members ?? []}');
  });
});

