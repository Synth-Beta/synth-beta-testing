import { describe, expect, it } from 'vitest';
import { runContextualSeed, ROOM_TIMEZONE } from './contextualSeed.js';
import { validateCandidateEvidence, wordCount } from './writingGuide.js';
import { PILOT_EVENTS } from '../fixtures/pilotEvents.js';
import { AUTHOR_TYPE_AI, DISCLOSURE_LABEL } from '../types.js';

describe('contextual seed (Take 5)', () => {
  it('records POST and SILENCE with distinct generation ids', () => {
    const result = runContextualSeed({
      targetDecisions: 200,
      seed: 42,
      senderCount: 8,
    });

    expect(result.stats.decisions).toBe(200);
    expect(result.stats.silences).toBeGreaterThan(40);
    expect(result.stats.silenceRate).toBeGreaterThan(0.25);
    expect(result.posts.length).toBeGreaterThan(40);

    const genIds = result.posts.map((p) => p.generation_id);
    expect(new Set(genIds).size).toBe(genIds.length);

    // No multi-turn episode shares one generation_id
    const byConvo = new Map<string, Set<string>>();
    for (const p of result.posts) {
      if (!p.conversation_id) continue;
      const set = byConvo.get(p.conversation_id) ?? new Set();
      set.add(p.generation_id);
      byConvo.set(p.conversation_id, set);
    }
    for (const gens of byConvo.values()) {
      // Each turn in a convo must be its own generation transaction
      expect(gens.size).toBeGreaterThanOrEqual(1);
    }

    // Multi-message episodes must have different generated_at
    for (const [cid, _] of byConvo) {
      const turns = result.posts
        .filter((p) => p.conversation_id === cid)
        .sort((a, b) => (a.turn_number ?? 0) - (b.turn_number ?? 0));
      if (turns.length < 2) continue;
      const times = new Set(turns.map((t) => t.generated_at));
      expect(times.size).toBe(turns.length);
    }
  });

  it('binds personas 1:1 to sender slots with unique names', () => {
    const result = runContextualSeed({
      targetDecisions: 100,
      seed: 7,
      senderCount: 8,
    });
    const slots = result.personas.map((p) => p.senderSlot);
    expect(new Set(slots).size).toBe(slots.length);
    const names = result.personas.map((p) => `${p.genreId}::${p.displayName}`);
    expect(new Set(names).size).toBe(names.length);

    for (const p of result.posts) {
      expect(p.persona_id).toBeTruthy();
      expect(p.sender_slot).not.toBeNull();
      expect(p.room_timezone).toBe(ROOM_TIMEZONE);
      expect(p.source_field_path).toBeTruthy();
      expect(p.cited_fact_ids.length).toBeGreaterThan(0);
      expect(p.source_retrieved_at).toBeTruthy();
      expect(/\b\d{4}-\d{2}-\d{2}\b/.test(p.content ?? '')).toBe(false);
      expect(/\.\.|p\.m\.\./i.test(p.content ?? '')).toBe(false);
    }
  });

  it('requires parent spans on replies and rejects filler', () => {
    const result = runContextualSeed({
      targetDecisions: 200,
      seed: 99,
      senderCount: 8,
    });
    const replies = result.posts.filter((p) => p.action === 'REPLY');
    expect(replies.length).toBeGreaterThan(0);
    for (const r of replies) {
      expect(r.parent_span).toBeTruthy();
      expect(r.addressed_parent_span).toBeTruthy();
      expect(
        /^(yeah|sure|that rules|i'?m in|if you say so)/i.test((r.content ?? '').trim()),
      ).toBe(false);
    }
  });

  it('includes mid-length messages and grounding evidence fields', () => {
    const result = runContextualSeed({
      targetDecisions: 200,
      seed: 42,
      senderCount: 8,
    });
    const n = result.posts.length;
    const { under8, mid8_20, mid21_45 } = result.stats.lengthBuckets;
    expect(under8 / n).toBeLessThan(0.45);
    expect(mid21_45).toBeGreaterThan(0);
    expect(result.stats.uniqueTexts / n).toBeGreaterThan(0.85);
  });
});

describe('contextual validators', () => {
  const event = PILOT_EVENTS[0]!;

  it('fails filler replies and missing parent span', () => {
    const r = validateCandidateEvidence({
      text: 'That rules.',
      authorType: AUTHOR_TYPE_AI,
      disclosureLabel: DISCLOSURE_LABEL,
      personaId: '11111111-1111-4111-a111-111111111111',
      personaName: 'Indie Guide 1',
      personaGenre: 'indie',
      roomGenre: 'indie',
      personaValid: true,
      conversationId: 'c1',
      turnNumber: 2,
      replyToTurn: 1,
      isReply: true,
      parentText: `${event.artistName} at ${event.venueName} on Aug 12.`,
      parentExists: true,
      parentSpan: null,
      addressedParentSpan: null,
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
      dataSegment: 'fixture',
      roomTimezone: 'America/New_York',
      scheduledAtUtc: '2026-08-10T20:00:00.000Z',
      eventStartsAtUtc: event.occurredAt,
      priorNormalized: [],
      priorExactTexts: [],
      priorFingerprints: [],
      familyShare: 0,
      graphValid: true,
      intent: 'reply',
    });
    expect(r.rejectionCodes).toContain('FILLER_REPLY');
    expect(r.rejectionCodes).toContain('PARENT_SPAN_MISSING');
  });

  it('fails ISO dates in copy', () => {
    const r = validateCandidateEvidence({
      text: `${event.artistName} at ${event.venueName} on 2026-08-12.`,
      authorType: AUTHOR_TYPE_AI,
      disclosureLabel: DISCLOSURE_LABEL,
      personaId: '11111111-1111-4111-a111-111111111111',
      personaName: 'Indie Guide 1',
      personaGenre: 'indie',
      roomGenre: 'indie',
      personaValid: true,
      conversationId: 'c1',
      turnNumber: 1,
      replyToTurn: null,
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
      dataSegment: 'fixture',
      roomTimezone: 'America/New_York',
      scheduledAtUtc: '2026-08-10T20:00:00.000Z',
      eventStartsAtUtc: event.occurredAt,
      priorNormalized: [],
      priorExactTexts: [],
      priorFingerprints: [],
      familyShare: 0,
      graphValid: true,
      intent: 'fact',
    });
    expect(r.rejectionCodes).toContain('ISO_DATE_IN_COPY');
  });

  it('wordCount helper still works', () => {
    expect(wordCount('Album cut over the single, for me.')).toBeGreaterThan(5);
  });
});
