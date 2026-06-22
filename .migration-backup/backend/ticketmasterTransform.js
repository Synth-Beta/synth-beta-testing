/**
 * Transform Ticketmaster API event -> jambase_events row
 * Adapted from scripts/ingest_ticketmaster_events.mjs (mapTicketmasterEventToRow)
 * Uses genreMapping.extractGenres for normalized genres.
 */

const { extractGenres } = require('./genreMapping');

function extractAttractionIds(embedded) {
  const atts = embedded?.attractions;
  if (!Array.isArray(atts)) return [];
  return atts.map((a) => a?.id).filter(Boolean);
}

function extractArtistName(embedded) {
  const atts = embedded?.attractions;
  if (!Array.isArray(atts) || atts.length === 0) return null;
  return atts[0]?.name || null;
}

function extractVenue(embedded) {
  const v = Array.isArray(embedded?.venues) ? embedded.venues[0] : undefined;
  if (!v) return {};
  return {
    venue_name: v.name || null,
    venue_address: v.address?.line1 || null,
    venue_city: v.city?.name || null,
    venue_state: v.state?.stateCode || null,
    venue_zip: v.postalCode || null,
    latitude: v.location?.latitude ? Number(v.location.latitude) : null,
    longitude: v.location?.longitude ? Number(v.location.longitude) : null,
    venue_timezone: v.timezone || null,
  };
}

function extractImages(images) {
  if (!Array.isArray(images)) return null;
  return images;
}

function extractMediaUrls(images) {
  if (!Array.isArray(images)) return [];
  return images.map((i) => i?.url).filter(Boolean);
}

function extractPrice(priceRanges) {
  if (!Array.isArray(priceRanges) || priceRanges.length === 0) {
    return { price_range: null, price_min: null, price_max: null, price_currency: 'USD' };
  }
  const p = priceRanges[0];
  const min = typeof p.min === 'number' ? p.min : null;
  const max = typeof p.max === 'number' ? p.max : null;
  const currency = p.currency || 'USD';
  const rangeText = [min, max].filter((x) => x !== null && x !== undefined).join(' - ');
  return {
    price_range: rangeText || null,
    price_min: min,
    price_max: max,
    price_currency: currency,
  };
}

/**
 * Transform a Ticketmaster API event object to a jambase_events row
 * @param {object} e - Raw event from Ticketmaster Discovery API
 * @returns {object} Row for jambase_events upsert
 */
function transformTicketmasterEvent(e) {
  const title = e.name || null;
  const description = e.info || e.pleaseNote || e.description || null;
  const url = e.url || null;
  const status = e?.dates?.status?.code || null;
  const startRaw = e?.dates?.start?.dateTime || e?.dates?.start?.localDate;
  const event_date = startRaw
    ? new Date(startRaw.includes('T') ? startRaw : startRaw + 'T12:00:00Z').toISOString()
    : null;
  const doors = e?.dates?.start?.dateTBD || e?.dates?.start?.dateTBA || e?.dates?.start?.noSpecificTime
    ? null
    : (e?.dates?.start?.dateTime ? new Date(e.dates.start.dateTime).toISOString() : null);
  const sales = e.sales || null;
  const classifications = e.classifications || null;
  const artistName = extractArtistName(e?._embedded) || (e?.name || null);
  const attractionIds = extractAttractionIds(e?._embedded);
  const genres = extractGenres(e);
  const venue = extractVenue(e?._embedded);
  const images = extractImages(e.images);
  const mediaUrls = extractMediaUrls(e.images);
  const { price_range, price_min, price_max, price_currency } = extractPrice(e.priceRanges);
  const source = 'ticketmaster';

  return {
    ticketmaster_event_id: e.id || null,
    title,
    artist_name: artistName || (e?.name || 'Unknown Artist'),
    artist_id: null,
    artist_uuid: null,
    venue_name: venue.venue_name || null,
    venue_id: null,
    venue_uuid: null,
    event_date,
    doors_time: doors,
    description,
    genres: Array.isArray(genres) && genres.length ? genres : null,
    venue_address: venue.venue_address,
    venue_city: venue.venue_city,
    venue_state: venue.venue_state,
    venue_zip: venue.venue_zip,
    latitude: venue.latitude,
    longitude: venue.longitude,
    ticket_available: Boolean(e?.dates?.status?.code === 'onsale' || e?.sales?.public?.startDateTime),
    price_range,
    price_min,
    price_max,
    price_currency,
    ticket_urls: url ? [url] : [],
    external_url: url,
    setlist: null,
    tour_name: e?.promoter?.name || null,
    source,
    event_status: status,
    classifications,
    sales_info: sales,
    attraction_ids: attractionIds.length ? attractionIds : null,
    venue_timezone: venue.venue_timezone,
    images,
    is_user_created: false,
    promoted: false,
    promotion_tier: null,
    promotion_start_date: null,
    promotion_end_date: null,
    is_featured: false,
    featured_until: null,
    created_by_user_id: null,
    claim_metadata: {},
    group_metadata: {},
    promotion_metadata: {},
    ticket_metadata: {
      seatmap: e?.seatmap || null,
      promoters: e?.promoters || e?.promoter || null,
      products: e?.products || null,
      outlets: e?.outlets || null,
      accessibility: e?.accessibility || null,
    },
    monetization_metadata: {},
    media_urls: mediaUrls,
  };
}

module.exports = { transformTicketmasterEvent };
