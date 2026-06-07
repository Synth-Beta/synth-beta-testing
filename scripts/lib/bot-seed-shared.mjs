/**
 * Shared utilities for Synth bot seeding scripts and cron.
 *
 * ANALYTICS EXCLUSION: Bot users have is_bot=true on public.users.
 * Filter them from DAU/MAU and engagement metrics:
 *   WHERE COALESCE(is_bot, false) = false
 * Or use the analytics_users view.
 */

export const BOT_SEED_ANALYTICS_NOTE =
  'Exclude bot users from metrics: WHERE COALESCE(is_bot, false) = false';

/** 8 bot personas with genre preferences (app slug keys). No avatars — matches real users without a photo. */
export const BOT_ACCOUNTS = [
  {
    slug: 'maya',
    displayName: 'Maya',
    bio: 'Indie kid with too many concert wristbands. Always hunting deep cuts.',
    genres: ['indie', 'country', 'rock'],
  },
  {
    slug: 'jordan',
    displayName: 'Jordan',
    bio: 'Festival season is my personality. Bass music and late sets.',
    genres: ['edm', 'pop'],
  },
  {
    slug: 'alex',
    displayName: 'Alex',
    bio: 'Hip-hop head. Bars, beats, and live show recaps only.',
    genres: ['hip-hop', 'rnb', 'pop'],
  },
  {
    slug: 'sam',
    displayName: 'Sam',
    bio: 'Rock and punk pits. Guitar tones are a love language.',
    genres: ['rock', 'metal'],
  },
  {
    slug: 'riley',
    displayName: 'Riley',
    bio: 'Jazz clubs by night, vinyl by day. Improv moments hit different.',
    genres: ['jazz', 'rnb', 'classical'],
  },
  {
    slug: 'casey',
    displayName: 'Casey',
    bio: 'Pop stan with opinions on every era. Tour production nerd.',
    genres: ['pop', 'rnb', 'indie'],
  },
  {
    slug: 'morgan',
    displayName: 'Morgan',
    bio: 'Folk storytelling and acoustic sets. Hidden gems only.',
    genres: ['country', 'indie'],
  },
  {
    slug: 'devon',
    displayName: 'Devon',
    bio: 'Jam bands, reggae roots, and long sets. Phish twitter refugee.',
    genres: ['jam-bands', 'reggae', 'rock'],
  },
];

/** Mirror of mobile/src/services/genreChatService GENRE_CONFIGS. */
export const GENRE_CONFIGS = [
  { id: 'edm', fullName: 'EDM / Electronic', emoji: '🎛️' },
  { id: 'jam-bands', fullName: 'Jam Bands', emoji: '🌀' },
  { id: 'rock', fullName: 'Rock', emoji: '🎸' },
  { id: 'hip-hop', fullName: 'Hip-Hop / Rap', emoji: '🎤' },
  { id: 'indie', fullName: 'Indie & Alternative', emoji: '🎵' },
  { id: 'jazz', fullName: 'Jazz & Blues', emoji: '🎷' },
  { id: 'metal', fullName: 'Metal & Punk', emoji: '🤘' },
  { id: 'pop', fullName: 'Pop', emoji: '⭐' },
  { id: 'rnb', fullName: 'R&B & Soul', emoji: '🕺' },
  { id: 'country', fullName: 'Country & Folk', emoji: '🤠' },
  { id: 'classical', fullName: 'Classical & Orchestral', emoji: '🎻' },
  { id: 'reggae', fullName: 'Reggae & Ska', emoji: '🌴' },
];

/** Prompt GENRE_CONTENT mapped to app slugs. */
const PROMPT_GENRE_CONTENT = {
  indie: {
    artists: ['Phoebe Bridgers', 'Boygenius', 'Big Thief', 'Mitski', 'Alex G', 'Snail Mail', 'Japanese Breakfast'],
    albums: ['Punisher', 'Dragon New Warm Mountain', 'Laurel Hell', 'Sometimes I Sit and Think'],
    venues: ['Bowery Ballroom', 'The Fillmore', '9:30 Club', 'First Ave'],
    topics: ['album deep cuts', 'surprise openers', 'setlist predictions', 'vinyl releases'],
  },
  electronic: {
    artists: ['Four Tet', 'Floating Points', 'Bonobo', 'Caribou', 'Jon Hopkins', 'Jamie xx', 'Fred again..'],
    albums: ['Crush', 'Promises', 'Sudden Fiction', 'Immunity'],
    venues: ['Brooklyn Mirage', 'Fabric', 'Output', 'Printworks'],
    topics: ['DJ sets vs live', 'festival lineups', 'new drops', 'sound systems'],
  },
  'hip-hop': {
    artists: ['Kendrick Lamar', 'Noname', 'Billy Woods', 'JPEGMAFIA', 'Tyler the Creator', 'Denzel Curry', 'Armand Hammer'],
    albums: ['GNX', 'Room 25', 'Aethiopes', 'Scaring the Hoes', 'Chromakopia'],
    venues: ['Apollo Theater', 'Rolling Loud', 'House of Blues', 'The Novo'],
    topics: ['bars analysis', 'production credits', 'album ranking', 'feature wishlist'],
  },
  pop: {
    artists: ['Charli xcx', 'Caroline Polachek', 'Troye Sivan', 'Lorde', 'Addison Rae', 'Gracie Abrams'],
    albums: ['Brat', 'Desire I Want to Turn Into You', 'Something to Give Each Other'],
    venues: ['Madison Square Garden', 'The Greek', 'Radio City Music Hall'],
    topics: ['era rankings', 'tour production', 'collab predictions', 'stan drama'],
  },
  rock: {
    artists: ['Fontaines D.C.', 'Wet Leg', 'Amyl and the Sniffers', 'Militarie Gun', 'Turnstile', 'The War on Drugs'],
    albums: ['Romance', 'Road to Michael', 'GLOW ON', 'A Deeper Understanding'],
    venues: ['Terminal 5', 'The Roxy', 'Metro Chicago', 'Teragram Ballroom'],
    topics: ['guitar tones', 'live energy', 'opener picks', 'new albums incoming'],
  },
  'r&b': {
    artists: ['SZA', 'Frank Ocean', 'Syd', 'Steve Lacy', 'Cleo Sol', 'Lucky Daye', 'Ari Lennox'],
    albums: ['SOS', 'Gemini Rights', 'Mirror', 'Closer to the Sun'],
    venues: ['Greek Theatre', 'The Novo', 'Brooklyn Steel'],
    topics: ['vocal runs', 'production vibes', 'slow jams vs bangers', 'tour dates'],
  },
  jazz: {
    artists: ['Makaya McCraven', 'Nubya Garcia', 'Irreversible Entanglements', 'GoGo Penguin', 'Yussef Dayes', 'Arooj Aftab'],
    albums: ['In These Times', 'Source', 'Black Impulse', 'Volume 2'],
    venues: ['Village Vanguard', 'Blue Note', 'Jazz Showcase', 'SFJAZZ'],
    topics: ['improvisation moments', 'album vs live', 'jazz fusion', 'new scene artists'],
  },
  metal: {
    artists: ['Knocked Loose', 'Portrayal of Guilt', 'Spiritbox', 'Power Trip', 'Cattle Decapitation', 'Blood Incantation'],
    albums: ["You Won't Go Before You're Supposed To", 'We Are Always Moving', 'Lambent Expression'],
    venues: ['Riot Fest', 'This Is Hardcore', 'Metro Chicago', 'Chain Reaction'],
    topics: ['pit etiquette', 'breakdown rankings', 'new riffs', 'fest lineups'],
  },
  folk: {
    artists: ['Joanna Newsom', 'Adrianne Lenker', 'Iron & Wine', 'Fleet Foxes', 'Waxahatchee', 'Bonny Light Horseman'],
    albums: ['abysskiss', 'Shore', 'Tigers Blood', 'Arkansas Sounds'],
    venues: ['Union Transfer', 'Largo', 'The Ark', 'Freight & Salvage'],
    topics: ['fingerpicking styles', 'lyrical storytelling', 'acoustic vs full band', 'hidden gems'],
  },
  punk: {
    artists: ['METZ', 'Amyl and the Sniffers', 'Drug Church', 'Chubby and the Gang', 'Dehd', 'Destroy Boys'],
    albums: ['Wasted Time', 'Tacker', 'Humidity', 'Never Slow Down'],
    venues: ['924 Gilman', 'Saint Vitus', 'The Fest', "Emo's"],
    topics: ['DIY ethics', 'zine culture', 'local scene', 'all-ages shows'],
  },
};

const EXTRA_GENRE_CONTENT = {
  'jam-bands': {
    artists: ['Phish', 'Dead & Company', 'Goose', 'Umphreys McGee', 'Widespread Panic', 'The Disco Biscuits'],
    albums: ['A Live One', 'Europe 72', 'Dripfield', 'Safety in Numbers'],
    venues: ['Red Rocks', 'Madison Square Garden', 'The Gorge', 'Merriweather Post'],
    topics: ['setlist guessing', 'jam lengths', 'taper culture', 'lot scene'],
  },
  classical: {
    artists: ['Yo-Yo Ma', 'Lang Lang', 'Hildur Guðnadóttir', 'Víkingur Ólafsson', 'Yuja Wang'],
    albums: ['Bach: Cello Suites', 'Glass: Piano Works', 'Chernobyl OST'],
    venues: ['Carnegie Hall', 'Lincoln Center', 'Hollywood Bowl', 'Symphony Hall'],
    topics: ['orchestra season', 'chamber recitals', 'film scores live', 'composer deep dives'],
  },
  reggae: {
    artists: ['Chronixx', 'Protoje', 'Koffee', 'Damian Marley', 'The Skatalites', 'Stick Figure'],
    albums: ['Chronology', 'A Matter of Time', 'Gifted', 'Welcome to Jamrock'],
    venues: ['Reggae Rise Up', 'Nine Mile', 'The Fillmore', 'Brooklyn Bowl'],
    topics: ['roots vs dancehall', 'ska revival', 'festival vibes', 'sound clash'],
  },
};

function mergeContent(...sources) {
  const merged = { artists: [], albums: [], venues: [], topics: [] };
  for (const src of sources) {
    if (!src) continue;
    for (const key of ['artists', 'albums', 'venues', 'topics']) {
      merged[key].push(...(src[key] || []));
    }
  }
  return merged;
}

/** Content keyed by app genre chat slug. */
export const GENRE_CONTENT = {
  edm: PROMPT_GENRE_CONTENT.electronic,
  indie: PROMPT_GENRE_CONTENT.indie,
  'hip-hop': PROMPT_GENRE_CONTENT['hip-hop'],
  pop: PROMPT_GENRE_CONTENT.pop,
  rock: PROMPT_GENRE_CONTENT.rock,
  rnb: PROMPT_GENRE_CONTENT['r&b'],
  jazz: PROMPT_GENRE_CONTENT.jazz,
  metal: mergeContent(PROMPT_GENRE_CONTENT.metal, PROMPT_GENRE_CONTENT.punk),
  country: mergeContent(PROMPT_GENRE_CONTENT.folk, {
    artists: ['Tyler Childers', 'Margo Price', 'Jason Isbell', 'Brandi Carlile'],
    albums: ['Purgatory', 'Traveller', 'Southeastern'],
    venues: ['Ryman Auditorium', 'Red Rocks', 'The Station Inn'],
    topics: ['honky-tonk nights', 'americana crossovers', 'festival camping'],
  }),
  'jam-bands': EXTRA_GENRE_CONTENT['jam-bands'],
  classical: EXTRA_GENRE_CONTENT.classical,
  reggae: EXTRA_GENRE_CONTENT.reggae,
};

/** Map raw genre strings from user_preferences to chat entity_id slugs. */
const GENRE_ALIAS_TO_SLUG = {
  edm: 'edm',
  electronic: 'edm',
  'electronic dance': 'edm',
  dance: 'edm',
  house: 'edm',
  techno: 'edm',
  'jam band': 'jam-bands',
  'jam bands': 'jam-bands',
  jamband: 'jam-bands',
  'jam-bands': 'jam-bands',
  rock: 'rock',
  'hip hop': 'hip-hop',
  'hip-hop': 'hip-hop',
  hiphop: 'hip-hop',
  rap: 'hip-hop',
  indie: 'indie',
  alternative: 'indie',
  'indie rock': 'indie',
  jazz: 'jazz',
  blues: 'jazz',
  metal: 'metal',
  punk: 'metal',
  'hardcore': 'metal',
  pop: 'pop',
  rnb: 'rnb',
  'r&b': 'rnb',
  'r and b': 'rnb',
  soul: 'rnb',
  country: 'country',
  folk: 'country',
  americana: 'country',
  classical: 'classical',
  orchestral: 'classical',
  reggae: 'reggae',
  ska: 'reggae',
};

export function normalizeGenreKey(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveUserGenreToChatSlug(genre) {
  const key = normalizeGenreKey(genre);
  if (!key) return null;

  if (GENRE_ALIAS_TO_SLUG[key]) return GENRE_ALIAS_TO_SLUG[key];

  for (const [alias, slug] of Object.entries(GENRE_ALIAS_TO_SLUG)) {
    if (key.includes(alias) || alias.includes(key)) return slug;
  }

  for (const config of GENRE_CONFIGS) {
    const configKey = normalizeGenreKey(config.fullName);
    if (key === configKey || key.includes(config.id) || configKey.includes(key)) {
      return config.id;
    }
  }

  return null;
}

export function botEmail(slug) {
  return `synth.bot.${slug}@getsynth.app`;
}

export function normalizeSignalGenre(slug) {
  return normalizeGenreKey(slug.replace(/-/g, ' '));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length > 0) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function botMention(bot) {
  if (bot.displayName) {
    return bot.displayName.split(/\s+/)[0].toLowerCase();
  }
  const u = bot.username || '';
  return u.replace(/_bot$/, '') || 'you';
}

function timestampOnDay(daysAgo, hour, minute) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, Math.floor(Math.random() * 50), 0);
  return d.toISOString();
}

function buildConversationDay(content, bots, daysAgo) {
  const artist = pick(content.artists);
  const album = pick(content.albums);
  const venue = pick(content.venues);
  const topic = pick(content.topics);
  const participants = pickN(bots, Math.min(3, bots.length));
  const [a, b, c] = participants;
  const ma = botMention(a);
  const mb = botMention(b);

  const threadVariants = [
    [
      { bot: a, text: `ok ${album} finally clicked for me. ${artist} is even better live than on record` },
      { bot: b, text: `@${ma} yeah the ${venue} set last month proved that — especially the ${topic} part` },
      ...(c
        ? [{ bot: c, text: `@${ma} hard agree. still go back to their older stuff more but that show was special` }]
        : []),
    ],
    [
      { bot: a, text: `anyone else at ${artist} when they played ${venue}?` },
      { bot: b, text: `@${ma} yep — ${album} songs hit way harder in that room` },
      ...(c ? [{ bot: c, text: `wasn't there but keep hearing that tour was worth it` }] : []),
    ],
    [
      { bot: a, text: `been on a ${artist} kick all week. ${album} on repeat` },
      { bot: b, text: `@${ma} same. the ${topic} deep cuts are what's getting me lately` },
      ...(c
        ? [{ bot: c, text: `@${mb} if you like that vibe check their live versions — different energy` }]
        : []),
    ],
  ];

  const lines = pick(threadVariants);
  const messages = [];
  let mins = 17 * 60 + 10 + Math.floor(Math.random() * 30);
  for (const line of lines) {
    messages.push({
      sender_id: line.bot.user_id,
      content: line.text,
      created_at: timestampOnDay(daysAgo, Math.floor(mins / 60), mins % 60),
      message_type: 'text',
      is_encrypted: false,
    });
    mins += 6 + Math.floor(Math.random() * 18);
  }
  return messages;
}

function buildQuestionDay(content, bots, daysAgo, genreSlug) {
  const artist = pick(content.artists);
  const album = pick(content.albums);
  const venue = pick(content.venues);
  const topic = pick(content.topics);
  const bot = pick(bots);
  const hour = 10 + Math.floor(Math.random() * 4);

  const questions = [
    `what's a ${genreSlug} album you'd put someone on if they've never really listened? looking for recs`,
    `anyone seen ${artist} live recently? worth catching on this tour or wait?`,
    `best smaller venue for ${genreSlug} in your city? trying to plan a few shows this summer`,
    `if you had to pick one ${album}-type record to replay all week what would it be?`,
    `who else is trying to get to ${venue} this year — any ${artist} dates worth the trip?`,
    `need a starting point for ${topic} — where do you even begin with ${genreSlug}?`,
  ];

  return [
    {
      sender_id: bot.user_id,
      content: pick(questions),
      created_at: timestampOnDay(daysAgo, hour, 5 + Math.floor(Math.random() * 40)),
      message_type: 'text',
      is_encrypted: false,
    },
  ];
}

/**
 * Day-based seed history: conversation days (thread) alternate with question days (open prompts).
 *
 * @param {object} opts
 * @param {string} opts.genreSlug
 * @param {Array<{ user_id: string, username?: string, displayName?: string }>} opts.bots
 * @param {string} [opts.batch='initial-v2']
 * @param {number} [opts.activeDays=10]
 */
export function generateSeedMessages({ genreSlug, bots, batch = 'initial-v2', activeDays = 10 }) {
  const content = GENRE_CONTENT[genreSlug];
  if (!content || !bots?.length) return [];

  const messages = [];
  for (let daysAgo = activeDays; daysAgo >= 1; daysAgo--) {
    const isQuestionDay = daysAgo % 2 === 0;
    const dayMessages = isQuestionDay
      ? buildQuestionDay(content, bots, daysAgo, genreSlug)
      : buildConversationDay(content, bots, daysAgo);

    for (const m of dayMessages) {
      messages.push({ ...m, metadata: { bot_seed: true, batch } });
    }
  }

  return messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

/** Single open question for daily cron — invites real user replies. */
export function generateDailyBotMessage({ genreSlug, bot }) {
  const content = GENRE_CONTENT[genreSlug];
  if (!content || !bot) return null;

  const artist = pick(content.artists);
  const topic = pick(content.topics);
  const questions = [
    `quick one — what's the last ${genreSlug} show that actually surprised you?`,
    `anyone have ${topic} recs? trying to branch out beyond ${artist}`,
    `what ${genreSlug} album are you spinning this week? need something new`,
    `debate: is ${artist} better live or on record? curious what people think`,
  ];

  return {
    sender_id: bot.user_id,
    content: pick(questions),
    created_at: new Date().toISOString(),
    message_type: 'text',
    is_encrypted: false,
    metadata: { bot_seed: true, batch: 'daily' },
  };
}

export function randomPastTimestamp(days = 14) {
  const now = Date.now();
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(now - Math.floor(Math.random() * ms)).toISOString();
}

export function log(status, message) {
  const icon = status === 'ok' ? '✓' : status === 'warn' ? '⚠' : status === 'err' ? '✗' : '·';
  console.log(`[BOT-SEED] ${icon} ${message}`);
}

export function parseArgs(argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run');
  const noWelcome = argv.includes('--no-welcome');
  const reseed = argv.includes('--reseed');
  const userIdArg = argv.find((a) => a.startsWith('--user-id='));
  const userId = userIdArg ? userIdArg.split('=')[1] : null;
  return { dryRun, noWelcome, reseed, userId };
}

export function getGenreConfig(slug) {
  return GENRE_CONFIGS.find((g) => g.id === slug);
}

export function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export { pick, pickN };
