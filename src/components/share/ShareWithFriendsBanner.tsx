export function isShareBannerDismissed(): boolean {
  return true;
}

interface ShareWithFriendsBannerProps {
  onDismiss: () => void;
  referralCode?: string | null;
}

export function ShareWithFriendsBanner({ onDismiss, referralCode }: ShareWithFriendsBannerProps) {
  void onDismiss;
  void referralCode;
  return null;
}
