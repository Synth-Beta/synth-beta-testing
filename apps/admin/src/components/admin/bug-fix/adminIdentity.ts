/**
 * Admin identity colors reuse GENRE_CONFIGS community hex values from
 * src/services/genreChatService.ts (and mobile equivalent).
 */
export const ADMIN_IDENTITY_COLORS = {
  Lauren: '#EC4899', // pop
  Sam: '#059669', // jam-bands
  Tej: '#DC2626', // rock
  Theo: '#0284C7', // jazz
} as const;

export type AdminIdentityName = keyof typeof ADMIN_IDENTITY_COLORS;

const FALLBACK_COLOR = '#5D646F'; // --neutral-600

export function resolveAdminIdentityName(name: string | null | undefined): AdminIdentityName | null {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  if (!first) return null;
  const match = (Object.keys(ADMIN_IDENTITY_COLORS) as AdminIdentityName[]).find(
    (key) => key.toLowerCase() === first.toLowerCase(),
  );
  return match ?? null;
}

export function adminOutlineColor(name: string | null | undefined): string {
  const identity = resolveAdminIdentityName(name);
  return identity ? ADMIN_IDENTITY_COLORS[identity] : FALLBACK_COLOR;
}

export function adminDisplayName(name: string | null | undefined): string {
  return resolveAdminIdentityName(name) ?? ((name ?? '').trim().split(/\s+/)[0] || 'Unknown');
}
