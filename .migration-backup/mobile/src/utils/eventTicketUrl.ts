/** JamBase-compliant outbound link (ticket first, else JamBase event page). */

export function getPrimaryTicketUrl(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const urls = (payload as any).ticket_urls;
  if (Array.isArray(urls) && urls.length > 0 && typeof urls[0] === 'string' && urls[0].trim()) {
    return urls[0].trim();
  }
  return null;
}

export function getJamBaseEventUrlFromPayload(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as any;
  const rawId = p.jambase_event_id ?? p.id ?? p.event_id;
  if (rawId == null || rawId === '') return null;
  const clean = String(rawId).replace(/^jambase:/i, '');
  if (!clean) return null;
  return `https://www.jambase.com/event/${clean}`;
}

export function getCompliantEventLinkFromPayload(payload: Record<string, unknown> | null | undefined): string | null {
  const ticket = getPrimaryTicketUrl(payload);
  if (ticket) return ticket;
  return getJamBaseEventUrlFromPayload(payload);
}
