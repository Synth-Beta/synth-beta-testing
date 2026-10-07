/** Read every page and fail visibly instead of treating a query failure as empty data. */
export const readAll = async (makeQuery: () => any, label: string): Promise<any[]> => {
  const rows: any[] = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await makeQuery().range(offset, offset + size - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
};
export const requireRows = (result: { data: any[] | null; error: { message: string } | null }, label: string) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data ?? [];
};

const artistNamesFromProfile = (profileData: any) => {
  if (!profileData || typeof profileData !== "object") return [];
  const byRange = profileData.topArtistsByTimeRange;
  const list = byRange?.medium_term ?? byRange?.short_term ?? byRange?.long_term ?? profileData.topArtists ?? [];
  const names: string[] = [];
  for (const artist of list) {
    const name = String(artist?.name || artist?.attributes?.name || "").trim();
    if (!name || names.some((existing) => existing.toLowerCase() === name.toLowerCase())) continue;
    names.push(name);
    if (names.length === 8) break;
  }
  return names;
};

const genresFromPreferences = (row: any) => {
  if (Array.isArray(row?.top_genres) && row.top_genres.length) {
    return row.top_genres.map((genre: any) => String(genre)).filter(Boolean).slice(0, 6);
  }
  const scores = row?.genre_preference_scores;
  if (!scores || typeof scores !== "object") return [];
  return Object.entries(scores)
    .sort((left, right) => Number(right[1]) - Number(left[1]))
    .slice(0, 6)
    .map(([genre]) => genre);
};

/** Listening lives on streaming_profiles and user_preferences. The old summary table is gone. */
export const loadListeningStats = async (db: { from: (table: string) => any }, userIds: string[]) => {
  const stats: any[] = [];
  for (let index = 0; index < userIds.length; index += 40) {
    const ids = userIds.slice(index, index + 40);
    if (!ids.length) continue;
    const profiles = await readAll(() => db.from("streaming_profiles")
      .select("user_id, service_type, profile_data, last_updated")
      .in("user_id", ids)
      .order("last_updated", { ascending: false })
      .order("user_id"), "Load listening history");
    const preferences = await readAll(() => db.from("user_preferences")
      .select("user_id, top_genres, genre_preference_scores")
      .in("user_id", ids)
      .order("user_id"), "Load listening genres");
    const genresByUser = new Map(preferences.map((row) => [row.user_id, genresFromPreferences(row)]));
    const seen = new Set<string>();
    for (const profile of profiles) {
      if (!profile.user_id || seen.has(profile.user_id)) continue;
      seen.add(profile.user_id);
      stats.push({
        user_id: profile.user_id,
        service_type: profile.service_type ?? null,
        top_artists: artistNamesFromProfile(profile.profile_data).map((name) => ({ name })),
        top_genres: (genresByUser.get(profile.user_id) ?? []).map((genre) => ({ genre })),
      });
    }
    for (const [userId, genres] of genresByUser) {
      if (seen.has(userId) || !genres.length) continue;
      stats.push({
        user_id: userId,
        service_type: null,
        top_artists: [],
        top_genres: genres.map((genre) => ({ genre })),
      });
    }
  }
  return stats;
};

/** Resolve manually entered artists without relying on a PostgREST relationship. */
export const enrichReviewArtists = async (db: { from: (table: string) => any }, reviews: any[]) => {
  const ids = [...new Set(reviews.map((row) => row.user_created_artist_id).filter(Boolean))];
  const names = new Map<string, string>();
  for (let index = 0; index < ids.length; index += 100) {
    const group = ids.slice(index, index + 100);
    const artists = await readAll(() => db.from("user_created_artists").select("id, name")
      .in("id", group).order("id"), "Load manually entered artists");
    for (const artist of artists) names.set(artist.id, artist.name);
  }
  return reviews.map((row) => ({ ...row,
    artistName: row.artists?.name ?? names.get(row.user_created_artist_id) ?? row.setlist?.artist?.name,
  }));
};
