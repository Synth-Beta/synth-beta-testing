import { FIXTURE_PACKS } from '../fixtures/packs.js';
import type {
  FetchArtistInput,
  FetchEventsInput,
  FetchSetlistsInput,
  FetchTopicSignalsInput,
  GroundedFact,
  MusicSourceAdapter,
} from '../types.js';

export class FixtureSourceAdapter implements MusicSourceAdapter {
  readonly name = 'fixture';

  constructor(private readonly scenarioId: string) {
    if (!FIXTURE_PACKS[scenarioId]) {
      throw new Error(`Unknown fixture scenario: ${scenarioId}`);
    }
  }

  private all(): GroundedFact[] {
    return FIXTURE_PACKS[this.scenarioId] ?? [];
  }

  async fetchUpcomingEvents(input: FetchEventsInput): Promise<GroundedFact[]> {
    return this.all().filter(
      (f) =>
        f.kind === 'event' &&
        (!input.genreId || f.genreId === input.genreId) &&
        (!input.city || !f.city || f.city.toLowerCase().includes(input.city.toLowerCase())),
    );
  }

  async fetchRecentSetlists(input: FetchSetlistsInput): Promise<GroundedFact[]> {
    return this.all().filter((f) => {
      if (f.kind !== 'setlist') return false;
      if (input.eventId && f.eventId !== input.eventId) return false;
      if (
        input.artistName &&
        f.artistName &&
        f.artistName.toLowerCase() !== input.artistName.toLowerCase()
      ) {
        return false;
      }
      return true;
    });
  }

  async fetchArtistFacts(input: FetchArtistInput): Promise<GroundedFact[]> {
    return this.all().filter(
      (f) =>
        (f.kind === 'artist' || f.kind === 'event') &&
        f.artistName?.toLowerCase() === input.artistName.toLowerCase(),
    );
  }

  async fetchTopicSignals(input: FetchTopicSignalsInput): Promise<GroundedFact[]> {
    return this.all().filter(
      (f) =>
        f.kind === 'topic_signal' &&
        (!input.genreId || f.genreId === input.genreId) &&
        (!input.artistName ||
          !f.artistName ||
          f.artistName.toLowerCase() === input.artistName.toLowerCase()),
    );
  }
}

export function listFixtureScenarios(): string[] {
  return Object.keys(FIXTURE_PACKS);
}
