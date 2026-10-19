export const substantive = (text?: string | null) => {
  const cleaned = String(text ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length >= 40;
};

export interface RankedArtist {
  name: string;
  score: number;
  mentions: number;
  bestText: string | null;
  shortOnly: boolean;
}

/** Stronger than recency: repeats, high ratings, and reviews that actually say something. */
export const rankArtists = (
  reviews: Array<{ artistName?: string | null; rating?: number | null; text?: string | null }>
): RankedArtist[] => {
  const groups = new Map<string, typeof reviews>();
  for (const review of reviews) {
    const name = review.artistName?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(review);
    groups.set(key, list);
  }
  const ranked: RankedArtist[] = [];
  for (const list of groups.values()) {
    const rating = Math.max(...list.map((review) => review.rating ?? 0));
    const texts = list.map((review) => String(review.text ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
    const bestText = [...texts].sort((left, right) => right.length - left.length)[0] ?? null;
    const shortOnly = texts.length === 0 || texts.every((text) => !substantive(text));
    const score = rating * 2 + (list.length > 1 ? 3 : 0) + (bestText && substantive(bestText) ? 2 : 0) - (shortOnly ? 3 : 0);
    ranked.push({ name: String(list[0].artistName), score, mentions: list.length, bestText, shortOnly });
  }
  return ranked.sort((left, right) => right.score - left.score || right.mentions - left.mentions || left.name.localeCompare(right.name));
};
