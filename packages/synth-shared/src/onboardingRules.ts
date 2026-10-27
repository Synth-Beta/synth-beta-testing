/**
 * One set of onboarding rules for web and iOS. They were two separate implementations
 * and drifted (web required city, iOS didn't; iOS required name, web didn't), so
 * every fix landed on one side only. Both profile steps gate Continue on this.
 *
 * Required: name, username, birthday (13+), how did you hear.
 * Optional: city, gender, bio (max 120), photo. "Other" detail is optional.
 */

export type OnboardingProfileInput = {
  name?: string;
  username?: string;
  birthday?: string; // YYYY-MM-DD
  acquisitionSource?: string | null;
  bio?: string;
};

export type OnboardingField = 'name' | 'username' | 'birthday' | 'acquisitionSource' | 'bio';

export const ONBOARDING_MIN_AGE = 13;
export const ONBOARDING_BIO_MAX = 120;
const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;

/**
 * iOS birthday is free text. Accept what people actually type (2000-1-5, 2000/01/05,
 * US 01/05/2000) and return YYYY-MM-DD; anything else comes back trimmed, unchanged.
 */
export function normalizeBirthday(raw: string): string {
  const s = raw.trim();
  const pad = (v: string) => v.padStart(2, '0');
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${pad(m[1])}-${pad(m[2])}`;
  return s;
}

function ageOn(birthday: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeBirthday(birthday));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  let age = now.getUTCFullYear() - y;
  const beforeBirthday = now.getUTCMonth() < mo - 1 || (now.getUTCMonth() === mo - 1 && now.getUTCDate() < d);
  if (beforeBirthday) age--;
  return age;
}

export function validateOnboardingProfile(
  input: OnboardingProfileInput,
  now: Date = new Date()
): { ok: boolean; errors: Partial<Record<OnboardingField, string>> } {
  const errors: Partial<Record<OnboardingField, string>> = {};

  if (!input.name?.trim()) errors.name = 'Please enter your name';

  const username = input.username?.trim() ?? '';
  if (!username) errors.username = 'Username is required';
  else if (!USERNAME_RE.test(username)) errors.username = 'Use 3-30 lowercase letters, numbers, _ or .';

  const birthday = input.birthday?.trim() ?? '';
  if (!birthday) errors.birthday = 'Birthday is required';
  else {
    const age = ageOn(birthday, now);
    if (age === null) errors.birthday = 'Enter your birthday as YYYY-MM-DD';
    else if (age < ONBOARDING_MIN_AGE) errors.birthday = `You must be at least ${ONBOARDING_MIN_AGE} years old`;
    else if (age > 120) errors.birthday = 'Enter a valid birthday';
  }

  if (!input.acquisitionSource) errors.acquisitionSource = 'Please select where you heard about Synth';

  if ((input.bio?.length ?? 0) > ONBOARDING_BIO_MAX) errors.bio = `Bio must be ${ONBOARDING_BIO_MAX} characters or less`;

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * Values the signup trigger seeds into users.name (metadata name, else email prefix,
 * else 'Synth User'): not the person's own choice, so the name field starts blank.
 */
export function isPlaceholderName(name: string | null | undefined, email?: string | null): boolean {
  const n = name?.trim() ?? '';
  if (!n || n === 'Synth User') return true;
  const prefix = email?.split('@')[0]?.trim();
  return !!prefix && n.toLowerCase() === prefix.toLowerCase();
}

/** Artist step: ids to start checked. Server flags win; otherwise the first `n`. */
export function pickPreselected<T extends { id: string; preselected?: boolean }>(rows: T[], n = 3): string[] {
  const flagged = rows.filter(r => r.preselected).map(r => r.id);
  return (flagged.length ? flagged : rows.map(r => r.id)).slice(0, n);
}
