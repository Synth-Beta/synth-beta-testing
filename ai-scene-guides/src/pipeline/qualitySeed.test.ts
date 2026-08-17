import { describe, expect, it } from 'vitest';
import { doorsLabelFromClaim } from './groundedConversation.js';
import { validateCandidateEvidence } from './writingGuide.js';
import { PILOT_EVENTS } from '../fixtures/pilotEvents.js';
import { AUTHOR_TYPE_AI, DISCLOSURE_LABEL } from '../types.js';

describe('doors time formatting', () => {
  it('does not truncate p.m. to p.', () => {
    const label = doorsLabelFromClaim('JamBase lists X. Doors 7:00 p.m. Confirm later.');
    expect(label).toBe('7:00 p.m.');
    expect(label).not.toMatch(/p\.$/);
  });
});

describe('Take 3/5 shared gates', () => {
  const event = PILOT_EVENTS[0]!;
  const base = {
    text: `${event.artistName} at ${event.venueName} on Aug 12. Doors 7:00 p.m.`,
    authorType: AUTHOR_TYPE_AI,
    disclosureLabel: DISCLOSURE_LABEL,
    personaId: '11111111-1111-4111-a111-111111111111',
    personaName: 'Indie Guide 1',
    personaGenre: 'indie',
    roomGenre: 'indie',
    personaValid: true,
    conversationId: 'conv-1',
    turnNumber: 1,
    replyToTurn: null as number | null,
    isReply: false,
    parentExists: true,
    eventId: event.eventId,
    artistName: event.artistName,
    venueName: event.venueName,
    city: event.city,
    eventLocalDate: 'Aug 12',
    eventLocalTimeLabel: '7:00 p.m.',
    sourceUrl: event.sourceUrl,
    sourceRetrievedAt: event.retrievedAt,
    sourceFieldPath: 'events.startDate+performer+location',
    citedFactIds: [event.id],
    dataSegment: 'fixture' as const,
    roomTimezone: 'America/New_York',
    scheduledAtUtc: '2026-08-10T20:00:00.000Z',
    eventStartsAtUtc: event.occurredAt,
    priorNormalized: [] as string[],
    priorExactTexts: [] as string[],
    priorFingerprints: [] as string[],
    familyShare: 0,
    graphValid: true,
    intent: 'fact',
  };

  it('fails persona gate when persona_id is blank', () => {
    const r = validateCandidateEvidence({ ...base, personaId: null, personaValid: false });
    expect(r.rejectionCodes).toContain('PERSONA_ID_MISSING');
  });

  it('fails JamBase in conversational copy', () => {
    const r = validateCandidateEvidence({
      ...base,
      text: `JamBase lists ${event.artistName} at ${event.venueName}.`,
    });
    expect(r.rejectionCodes).toContain('SOURCE_WORKFLOW_LANGUAGE');
  });

  it('fails exact text duplicate', () => {
    const exact = base.text.toLowerCase().replace(/\s+/g, ' ').trim();
    const r = validateCandidateEvidence({
      ...base,
      priorExactTexts: [exact],
    });
    expect(r.rejectionCodes).toContain('EXACT_DUPLICATE');
  });
});
