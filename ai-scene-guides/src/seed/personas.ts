import { uuidFromSeed, newId } from '../lib/hash.js';
import {
  ARCHETYPES,
  DISCLOSURE_LABEL,
  type AiGuidePersona,
  type Archetype,
} from '../types.js';

const GENRE_DISPLAY: Record<string, string> = {
  indie: 'Indie',
  'hip-hop': 'Hip-Hop',
  edm: 'EDM',
  metal: 'Metal',
  pop: 'Pop',
  rock: 'Rock',
  jazz: 'Jazz',
  country: 'Country',
  rnb: 'R&B',
  classical: 'Classical',
  reggae: 'Reggae',
  'jam-bands': 'Jam',
};

const FOCUS_LABELS = [
  'Setlist Guide',
  'Release Radar',
  'Deep-Cut Guide',
  'Show Scout',
  'Venue Notes',
  'Opener Watch',
  'Discovery Guide',
  'Tour Tracker',
  'Catalog Guide',
  'Scene Notes',
];

/** Mulberry32 PRNG for deterministic seeding. */
export function createRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function stableId(genreId: string, seedKey: string): string {
  return uuidFromSeed(`${genreId}:${seedKey}`);
}

/**
 * Deterministic persona catalog. Never creates Auth credentials, followers, or social graph.
 */
export function seedPersonas(options: {
  genreId: string;
  count: number;
  seed: number;
}): { personas: AiGuidePersona[]; warnings: string[] } {
  const { genreId, count, seed } = options;
  if (count < 50 || count > 100) {
    throw new Error('Persona count must be between 50 and 100');
  }
  const rng = createRng(seed);
  const genreLabel = GENRE_DISPLAY[genreId] ?? genreId.replace(/-/g, ' ');
  const personas: AiGuidePersona[] = [];
  const usedNames = new Set<string>();
  const comboCounts = new Map<string, number>();
  const warnings: string[] = [];

  for (let i = 0; i < count; i++) {
    const archetype = ARCHETYPES[i % ARCHETYPES.length] as Archetype;
    const focus = FOCUS_LABELS[i % FOCUS_LABELS.length]!;
    let displayName = `${genreLabel} ${focus}`;
    let suffix = 0;
    while (usedNames.has(displayName)) {
      suffix += 1;
      displayName = `${genreLabel} ${focus} ${suffix + 1}`;
    }
    usedNames.add(displayName);

    const seedKey = `g=${genreId}|i=${i}|s=${seed}|a=${archetype}|f=${focus}`;
    const combo = `${archetype}|${focus}`;
    comboCounts.set(combo, (comboCounts.get(combo) ?? 0) + 1);

    const concise = rng() > 0.5;
    const enthusiastic = rng() > 0.45;
    const questionLed = rng() > 0.55;
    const deepCut = rng() > 0.5;

    personas.push({
      id: stableId(genreId, seedKey),
      genreId,
      displayName,
      avatarAsset: null,
      archetype,
      voiceTraits: {
        concise,
        enthusiastic,
        questionLed,
        dry: !enthusiastic,
        factLed: !questionLed,
      },
      interestWeights: {
        localEvents: deepCut ? 0.4 : 0.7,
        globalScene: deepCut ? 0.7 : 0.4,
        setlists: archetype === 'setlist nerd' ? 0.9 : 0.3,
        venues: archetype === 'local-show scout' ? 0.8 : 0.4,
        openers: 0.5,
        releases: archetype === 'discovery connector' ? 0.85 : 0.45,
        discovery: deepCut ? 0.8 : 0.5,
      },
      messageLengthDistribution: concise
        ? { short: 0.6, medium: 0.35, long: 0.05 }
        : { short: 0.25, medium: 0.55, long: 0.2 },
      emojiRate: 0.02 + rng() * 0.1,
      questionRate: 0.22 + rng() * 0.15,
      slangLevel: 0.05 + rng() * 0.2,
      activityWindows: [
        { startHour: 10, endHour: 14 },
        { startHour: 17, endHour: 22 },
      ],
      disclosureLabel: DISCLOSURE_LABEL,
      isActive: true,
      seedKey,
    });
  }

  for (const [combo, n] of comboCounts) {
    if (n > Math.ceil(count / ARCHETYPES.length) + 2) {
      warnings.push(`Repeated combination ${combo} appears ${n} times`);
    }
  }

  // Ensure no accidental credential-like fields
  for (const p of personas) {
    if ('password' in p || 'email' in p || 'auth' in p) {
      throw new Error('Seed must not create credentials');
    }
  }

  return { personas, warnings };
}

export function randomUuidFallback(): string {
  return newId();
}
