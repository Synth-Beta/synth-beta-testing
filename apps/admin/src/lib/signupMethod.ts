export type SignupMethod = 'apple' | 'android' | 'email' | 'unknown';

const VALID_SIGNUP_METHODS: SignupMethod[] = ['apple', 'android', 'email', 'unknown'];

/**
 * The RPC already normalizes provider -> signup_method server-side; this validates
 * the boundary response defensively rather than trusting it blindly.
 */
export function normalizeSignupMethod(value: string | null | undefined): SignupMethod {
  if (value && (VALID_SIGNUP_METHODS as string[]).includes(value)) {
    return value as SignupMethod;
  }
  return 'unknown';
}

export const SIGNUP_METHOD_LABELS: Record<SignupMethod, string> = {
  apple: 'Apple (iOS)',
  android: 'Android (Google)',
  email: 'Email',
  unknown: 'Unknown',
};

export const SIGNUP_METHOD_BADGE_VARIANT: Record<SignupMethod, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  apple: 'default',
  android: 'secondary',
  email: 'outline',
  unknown: 'destructive',
};

export const SIGNUP_METHOD_FILTER_OPTIONS: Array<{ value: 'all' | SignupMethod; label: string }> = [
  { value: 'all', label: 'All Signup Methods' },
  { value: 'apple', label: SIGNUP_METHOD_LABELS.apple },
  { value: 'android', label: SIGNUP_METHOD_LABELS.android },
  { value: 'email', label: SIGNUP_METHOD_LABELS.email },
  { value: 'unknown', label: SIGNUP_METHOD_LABELS.unknown },
];
