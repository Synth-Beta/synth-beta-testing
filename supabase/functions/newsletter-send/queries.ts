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
