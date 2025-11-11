const RATE_LIMIT_DELAY = 1000;
let lastRequestTime = 0;

const allowedOrigins = [
  'https://synth-beta-testing.vercel.app',
  'https://synth-beta-testing-main.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000'
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const transformSetlist = (setlist) => ({
  setlistFmId: setlist.id,
  versionId: setlist.versionId,
  eventDate: setlist.eventDate,
  artist: {
    name: setlist.artist?.name ?? '',
    mbid: setlist.artist?.mbid ?? ''
  },
  venue: {
    name: setlist.venue?.name ?? '',
    city: setlist.venue?.city?.name ?? '',
    state: setlist.venue?.city?.state ?? '',
    country: setlist.venue?.city?.country?.name ?? ''
  },
  tour: setlist.tour?.name,
  info: setlist.info,
  url: setlist.url,
  songs:
    setlist.sets?.set?.flatMap((set, setIndex) =>
      set.song?.map((song, songIndex) => ({
        name: song.name,
        position: songIndex + 1,
        setNumber: setIndex + 1,
        setName: set.name || `Set ${setIndex + 1}`,
        cover: song.cover
          ? {
              artist: song.cover.name,
              mbid: song.cover.mbid
            }
          : undefined,
        info: song.info,
        tape: song.tape || false
      })) ?? []
    ) ?? [],
  songCount:
    setlist.sets?.set?.reduce((total, set) => total + (set.song?.length ?? 0), 0) ?? 0,
  lastUpdated: new Date().toISOString()
});

export default async function handler(req, res) {
  // Handle CORS
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || origin.includes('vercel.app'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY) {
      await sleep(RATE_LIMIT_DELAY - elapsed);
    }
    lastRequestTime = Date.now();

    const { artistName, date, venueName, cityName, stateCode } = req.query;

    const queryParams = new URLSearchParams();
    if (artistName) queryParams.append('artistName', artistName);

    if (date) {
      const parsedDate = new Date(date);
      if (!Number.isNaN(parsedDate.getTime())) {
        const day = String(parsedDate.getDate()).padStart(2, '0');
        const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const year = parsedDate.getFullYear();
        queryParams.append('date', `${day}-${month}-${year}`);
      }
    }

    if (venueName) queryParams.append('venueName', venueName);
    if (cityName) queryParams.append('cityName', cityName);
    if (stateCode) queryParams.append('stateCode', stateCode);

    const baseUrl = 'https://api.setlist.fm/rest/1.0';
    const url = `${baseUrl}/search/setlists?${queryParams.toString()}`;

    console.log('🎵 Serverless Setlist Proxy:', url);

    const apiKey =
      process.env.SETLIST_FM_API_KEY ??
      'QxGjjwxk0MUyxyCJa2FADnFRwEqFUy__7wpt';

    const response = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        Accept: 'application/json',
        'User-Agent': 'PlusOne/1.0 (https://plusone.app)'
      }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Setlist.fm serverless proxy error:', response.status, errorBody);

      if (response.status === 404) {
        res.json({ setlist: [] });
        return;
      }

      res.status(response.status).json({
        error: 'Setlist.fm API error',
        message: errorBody
      });
      return;
    }

    const data = await response.json();
    const transformed = (data.setlist ?? []).map(transformSetlist);

    res.json({ setlist: transformed });
  } catch (error) {
    console.error('Serverless setlist proxy failure:', error);
    res.status(500).json({
      error: 'Failed to proxy setlist request',
      message: error?.message ?? 'Unknown error'
    });
  }
}

