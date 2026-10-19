export interface FoundTrack {
  artistName: string;
  trackName: string;
  url: string;
}

const normalize = (value: string) =>
  value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

const tokens = (value: string) => normalize(value).split(" ").filter((word) => word.length > 1 || word === "o");

const sameToken = (left: string, right: string) => left === right || left.replace(/s$/, "") === right.replace(/s$/, "");

/** Title-like phrases in a review, excluding the artist and venue names. */
export const titlePhrases = (text: string, banned: string[]) => {
  const small = new Set(["a", "an", "the", "in", "of", "on", "and", "or", "to", "for", "with"]);
  const starters = new Set(["loved", "only", "best", "these", "cool", "first", "amazing", "really", "will", "and", "this", "friends", "saw", "seeing", "brought", "was", "were", "had", "just"]);
  const chunks = String(text ?? "").replace(/[“”"]/g, "").split(/[.!?;\n]|…|\.{2,}/);
  const phrases: string[][] = [];
  for (const chunk of chunks) {
  let current: string[] = [];
  const flush = () => {
    while (current.length && (small.has(current[0].toLowerCase()) || starters.has(current[0].toLowerCase()))) current.shift();
    while (current.length && small.has(current[current.length - 1].toLowerCase())) current.pop();
    if (current.length >= 2 && current.length <= 5) phrases.push([...current]);
    current = [];
  };
  for (const raw of chunk.split(/\s+/)) {
    const word = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9'’.-]+$/g, "");
    if (!word) {
      flush();
      continue;
    }
    if (/^[A-Z0-9]/.test(word)) current.push(word);
    else if (current.length && small.has(word.toLowerCase())) current.push(word);
    else flush();
  }
  flush();
  }
  const ban = banned.map(normalize);
  return phrases
    .map((parts) => parts.join(" "))
    .filter((phrase) => {
      const key = normalize(phrase);
      return key.length >= 5 && !/tribute|setlist|tour ever/.test(key) && !ban.some((item) => item === key);
    });
};

export const findTrack = async (phrase: string, artistHint?: string): Promise<FoundTrack | null> => {
  const response = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent([phrase, artistHint].filter(Boolean).join(" "))}&entity=song&limit=8`
  );
  if (!response.ok) return null;
  const body = await response.json().catch(() => ({}));
  const want = tokens(phrase);
  const hint = tokens(artistHint ?? "").filter((word) => word.length > 3);
  let fallback: FoundTrack | null = null;
  for (const item of body.results ?? []) {
    if (!item?.trackViewUrl || !item?.trackName) continue;
    const trackTokens = tokens(String(item.trackName));
    if (!want.length || !want.every((word) => trackTokens.some((token) => sameToken(token, word)))) continue;
    const artistTokens = tokens(String(item.artistName ?? ""));
    const artistMatches = hint.some((word) => artistTokens.some((token) => sameToken(token, word)));
    const found = { artistName: String(item.artistName), trackName: String(item.trackName), url: String(item.trackViewUrl) };
    if (artistMatches) return found;
    if (want.length >= 2) fallback = fallback ?? found;
  }
  return fallback;
};

const DISCOVERY_ARTISTS = ["Talking Heads", "Aretha Franklin", "Nina Simone"];

/** Shared live recordings for accounts without a personal listen. URLs come from the lookup, not a hardcoded link. */
export const discoveryTracks = async (): Promise<{ listens: ResolvedListen[]; errors: string[] }> => {
  const listens: ResolvedListen[] = [];
  const errors: string[] = [];
  for (const artist of DISCOVERY_ARTISTS) {
    try {
      const found = await evergreenTrack(artist);
      if (!found) continue;
      listens.push({
        ...found,
        evergreen: true,
        reason: `“${found.trackName}” by ${found.artistName} is a live recording worth hearing. It is a general pick, not a match to a saved preference, and it is not this week’s news.`,
      });
      if (listens.length === 2) break;
    } catch (error) {
      errors.push(`Listening search for ${artist} failed: ${error instanceof Error ? error.message : String(error)}.`);
    }
  }
  if (!listens.length && !errors.length) {
    errors.push("No verified live recording came back for the general listening picks.");
  }
  return { listens, errors };
};

export const evergreenTrack = async (artistName: string): Promise<FoundTrack | null> => {
  const found = await findTrack("live", artistName);
  if (!found || !/\blive\b/i.test(found.trackName)) return null;
  const hint = tokens(artistName).filter((word) => word.length > 3);
  const artistTokens = tokens(found.artistName);
  if (!hint.some((word) => artistTokens.some((token) => sameToken(token, word)))) return null;
  return found;
};

export interface ResolvedListen extends FoundTrack {
  reason: string;
  evergreen: boolean;
}

export const listensForReviews = async (
  reviews: Array<{ artistName?: string | null; venueName?: string | null; text?: string | null }>
): Promise<ResolvedListen[]> => {
  const listens: ResolvedListen[] = [];
  const seen = new Set<string>();
  const push = (listen: ResolvedListen) => {
    const key = listen.trackName.toLowerCase();
    if (seen.has(key) || listens.length >= 2) return;
    seen.add(key);
    listens.push(listen);
  };

  let attempts = 0;
  for (const review of reviews) {
    const phrases = titlePhrases(String(review.text ?? ""), [review.artistName, review.venueName].filter(Boolean) as string[]);
    for (const phrase of phrases) {
      if (attempts >= 8 || listens.length >= 2) break;
      if (seen.has(phrase.toLowerCase())) continue;
      attempts += 1;
      const found = await findTrack(phrase, review.artistName ?? undefined);
      if (!found) continue;
      const sameArtist = normalize(found.artistName).includes(normalize(review.artistName ?? ""))
        || normalize(review.artistName ?? "").includes(normalize(found.artistName));
      push({
        ...found,
        evergreen: false,
        reason: sameArtist
          ? `You wrote about ${phrase}. “${found.trackName}” is that recording.`
          : `If you liked ${phrase} from ${review.artistName ?? "that show"}, try “${found.trackName}” by ${found.artistName}.`,
      });
    }
  }

  if (!listens.length) {
    for (const review of reviews) {
      const linked = String(review.text ?? "").match(/https?:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]+/);
      if (!linked || listens.length >= 2) break;
      const response = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(linked[0])}`);
      const body = response.ok ? await response.json().catch(() => null) : null;
      const trackName = String(body?.title ?? "").trim();
      if (!trackName) continue;
      push({
        artistName: review.artistName || "the artist you logged",
        trackName,
        url: linked[0],
        evergreen: false,
        reason: `You linked “${trackName}” from that ${review.artistName ?? "show"} note. Here is the same recording, with the title attached.`,
      });
    }
  }
  return listens;
};
