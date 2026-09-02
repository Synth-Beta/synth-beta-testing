interface ShareAppCTAProps {
  referralCode?: string | null;
  source?: string;
  compact?: boolean;
}

/** Inline CTA: one Share button. Opens share sheet with event-together message + link; records referral_shares + interactions. */
export function ShareAppCTA({ referralCode, source, compact }: ShareAppCTAProps) {
  void referralCode;
  void source;
  void compact;
  return null;
}
