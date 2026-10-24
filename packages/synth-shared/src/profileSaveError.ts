/**
 * Turns an onboarding profile-save failure into something a new user can act on,
 * plus a short code for telemetry (onboarding_blocked_profile_save_threw_<code>).
 * A generic "Failed to save profile" stranded users who retried 8 times and left,
 * and hid the cause from us. Raw database text is never shown.
 */

export type ProfileSaveError = { code: string; message: string };

const FIELD_LABELS: Record<string, string> = {
  username: 'username',
  name: 'name',
  birthday: 'birthday',
  gender: 'gender',
  bio: 'bio',
  location_city: 'city',
  contact_email: 'email',
  acquisition_source: '"how did you hear about Synth" answer',
  other_acquisition_source: '"how did you hear about Synth" answer',
  avatar_url: 'profile photo',
};

const label = (column: string | undefined) => (column && FIELD_LABELS[column]) || 'one of your answers';

export function describeProfileSaveError(err: unknown): ProfileSaveError {
  const e = (err ?? {}) as { code?: unknown; message?: unknown; name?: unknown };
  const message = typeof e.message === 'string' ? e.message : typeof err === 'string' ? err : '';
  const code = typeof e.code === 'string' && e.code ? e.code : '';

  if (!code && (e.name === 'TypeError' || /failed to fetch|network|load failed/i.test(message))) {
    return { code: 'network', message: 'Connection problem. Check your internet and try again.' };
  }

  switch (code) {
    case '23505':
      return {
        code,
        message: /username/i.test(message)
          ? 'That username is taken. Try another one.'
          : 'Some of these details are already used by another account.',
      };
    case '23514': {
      const column = message.match(/constraint "users_([a-z_]+?)_check"/)?.[1];
      return { code, message: `Please check your ${label(column)} and try again.` };
    }
    case '23502': {
      const column = message.match(/column "([a-z_]+)"/)?.[1];
      return { code, message: `Please fill in your ${label(column)}.` };
    }
    case '22007':
    case '22008':
      return { code, message: 'Your birthday looks invalid. Use YYYY-MM-DD.' };
    case '22001':
      return { code, message: 'One of your answers is too long. Please shorten it.' };
    case 'PGRST301':
    case '42501':
      return { code, message: 'Your session expired. Please sign in again to finish.' };
  }
  if (/jwt|not authenticated|no authenticated user/i.test(message)) {
    return { code: code || 'auth', message: 'Your session expired. Please sign in again to finish.' };
  }
  const shown = code || 'unknown';
  return { code: shown, message: `Could not save your profile (error ${shown}). Please try again.` };
}
