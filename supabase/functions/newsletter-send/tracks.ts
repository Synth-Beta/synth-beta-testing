export interface Recording {
  artistName: string;
  trackName: string;
  url: string;
  reason?: string;
  sourceUrl?: string;
  evergreen?: boolean;
}

export const normalizeArtist = (value: string) => value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");

/** Both Spotify and Apple Music store real titles and artist names in profile_data. */
export const profileRecordings = (profile: any): Recording[] => {
  const byRange = profile?.topTracksByTimeRange;
  const rows = [
    ...(byRange?.medium_term ?? []), ...(byRange?.long_term ?? []),
    ...(byRange?.short_term ?? []), ...(profile?.topTracks ?? []),
  ];
  const recordings: Recording[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const trackName = String(row?.name ?? row?.attributes?.name ?? "").trim();
    const artistName = String(row?.artists?.[0]?.name ?? row?.artistName ?? row?.attributes?.artistName ?? "").trim();
    if (!trackName || !artistName) continue;
    const candidate = row.external_urls?.spotify ?? row.attributes?.url ?? row.url;
    let url = `https://open.spotify.com/search/${encodeURIComponent(`${artistName} ${trackName}`)}`;
    try { if (candidate && new URL(candidate).protocol === "https:") url = candidate; } catch { /* Use the named-song search. */ }
    const key = `${normalizeArtist(artistName)}:${trackName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recordings.push({ artistName, trackName, url, reason: "From your saved listening. Give it another spin before choosing your next night out." });
    if (recordings.length === 12) break;
  }
  return recordings;
};

/** One shared lookup per artist per edition, with a deadline and an exact artist match. */
export const lookupRecordings = async (artists: string[]): Promise<Recording[]> => {
  const names = [...new Map(artists.filter(Boolean).map((name) => [normalizeArtist(name), name])).values()].slice(0, 24);
  const results: Recording[][] = new Array(names.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, names.length) }, async () => {
    while (next < names.length) {
      const index = next++;
      const artist = names[index];
      results[index] = [];
      try {
        const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=song&limit=8`, {
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) continue;
        const body = await response.json();
        results[index] = (body.results ?? []).filter((row: any) =>
          normalizeArtist(String(row.artistName ?? "")) === normalizeArtist(artist)
          && row.trackName && /^https:\/\//.test(String(row.trackViewUrl ?? ""))
        ).slice(0, 2).map((row: any) => ({
          artistName: row.artistName, trackName: row.trackName, url: row.trackViewUrl,
          reason: "A song to try before making plans for the show.",
        }));
      } catch { /* Curated recordings remain available when the catalog is unreachable. */ }
    }
  }));
  return results.flat();
};
