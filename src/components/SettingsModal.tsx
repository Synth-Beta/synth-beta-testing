import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  LogOut, User, Bell, Shield, Mail, Key, AtSign, Eye, EyeOff,
  AlertCircle, CheckCircle, ArrowLeft, Info, ChevronRight, UserX, Lock,
} from 'lucide-react';
import { OnboardingPreferencesSettings } from '@/components/OnboardingPreferencesSettings';
import { supabase } from '@/integrations/supabase/client';
import { UserVisibilityService } from '@/services/userVisibilityService';
import { useAuth } from '@/hooks/useAuth';
import { VerificationStatusCard } from '@/components/verification/VerificationStatusCard';
import { ParentalControlsSettings } from '@/components/ParentalControlsSettings';
import {
  getUserSettingsPreferences,
  updateUserSettingsPreferences,
  getCurrentUserSettingsPreferences,
  updateCurrentUserSettingsPreferences,
} from '@/services/userSettingsPreferencesService';
import { useViewTracking } from '@/hooks/useViewTracking';
import { Capacitor } from '@capacitor/core';
import { getApiBaseUrl } from '@/utils/apiBaseUrl';
import { toast } from '@/hooks/use-toast';

export type SettingsModalView =
  | 'menu'
  | 'onboarding-preferences'
  | 'security-actions'
  | 'verification'
  | 'parental-controls'
  | 'delete-account';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignOut: () => void;
  userEmail?: string;
  initialView?: SettingsModalView;
}

export const SettingsModal = ({ isOpen, onClose, onSignOut, userEmail, initialView }: SettingsModalProps) => {
  // Track settings view when modal opens
  useViewTracking('view', 'settings', { source: 'settings' }, undefined, { enabled: isOpen });

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [view, setView] = useState<SettingsModalView>('menu');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [isPublicProfile, setIsPublicProfile] = useState(true);
  const [isLoadingVisibility, setIsLoadingVisibility] = useState(false);
  const [hasProfilePicture, setHasProfilePicture] = useState(true);
  const [accountType, setAccountType] = useState<'user' | 'creator' | 'business' | 'admin'>('user');
  const [isVerified, setIsVerified] = useState(false);
  const [enablePushNotifications, setEnablePushNotifications] = useState(true);
  const [enableEmails, setEnableEmails] = useState(true);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountInput, setDeleteAccountInput] = useState('');
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  // Profile display state for the header
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  const { user } = useAuth();

  useEffect(() => {
    if (isOpen) {
      setView(initialView ?? 'menu');
    } else {
      setView('menu');
    }
  }, [initialView, isOpen]);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await onSignOut();
      onClose();
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleClose = () => {
    setView('menu');
    setNewEmail('');
    setDeleteAccountInput('');
    setDeleteAccountError(null);
    onClose();
  };

  const handleBack = () => {
    setView('menu');
    setNewEmail('');
    setDeleteAccountInput('');
    setDeleteAccountError(null);
  };

  const notifyNativeAccountDeleted = () => {
    if (typeof window === 'undefined') {
      return;
    }
    const handler = (window as any).webkit?.messageHandlers?.synthNativeAuth;
    if (handler?.postMessage) {
      handler.postMessage({ action: 'userDeleted' });
    }
  };

  const handleResetPassword = async () => {
    if (!userEmail) return;
    setIsResettingPassword(true);
    try {
      const isMobile = Capacitor.isNativePlatform();
      const redirectUrl = isMobile
        ? 'synth://reset-password'
        : 'https://synth-beta-testing.vercel.app/reset-password';
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, { redirectTo: redirectUrl });
      if (error) throw error;
      toast({ title: 'Email sent', description: `Password reset link sent to ${userEmail}.` });
    } catch (error: any) {
      console.error('Error sending password reset:', error);
      toast({ title: 'Could not send reset email', description: error?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim() || newEmail === userEmail) return;
    setIsChangingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;
      toast({ title: 'Confirmation sent', description: `Check ${newEmail} for a confirmation link.` });
      setNewEmail('');
    } catch (error: any) {
      console.error('Error changing email:', error);
      toast({ title: 'Could not change email', description: error?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsChangingEmail(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;
    if (deleteAccountInput !== 'DELETE') {
      setDeleteAccountError(`Text doesn't match expected output, type "DELETE" to continue`);
      return;
    }
    setIsDeletingAccount(true);
    setDeleteAccountError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token;
      if (!accessToken) {
        throw new Error('No active session token found');
      }

      const base = getApiBaseUrl();
      if (!base) {
        const missingBaseMessage = 'Missing API base URL. Set VITE_PUBLIC_SITE_URL or VITE_API_BASE_URL.';
        toast({
          title: 'Missing API base URL',
          description: 'Set VITE_PUBLIC_SITE_URL so native builds can reach the API.',
          variant: 'destructive',
        });
        setDeleteAccountError(missingBaseMessage);
        return;
      }

      const rsp = await fetch(`${base}/api/delete-account`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
      if (!rsp.ok) {
        const bodyText = await rsp.text();
        let parsedBody: Record<string, any> | null = null;
        try {
          parsedBody = JSON.parse(bodyText);
        } catch {
          parsedBody = null;
        }
        console.error('Delete request failed', {
          base,
          status: rsp.status,
          bodyText,
          bodyJson: parsedBody,
        });

        const fallbackMessage = `Delete request failed (${rsp.status})`;
        const errorMessage =
          parsedBody?.message ||
          parsedBody?.error ||
          bodyText ||
          fallbackMessage;
        throw new Error(errorMessage);
      }

      window.webkit?.messageHandlers?.synthNativeAuth?.postMessage({ action: 'userDeleted' });
      await onSignOut();
      handleClose();
      notifyNativeAccountDeleted();
      window.location.href = '/';
    } catch (error) {
      console.error('Error deleting account:', error);
      setDeleteAccountError('Failed to delete account. Please try again.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleToggleProfileVisibility = async (checked: boolean) => {
    if (!user?.id) return;
    setIsLoadingVisibility(true);
    try {
      if (checked) {
        const hasProfilePic = await UserVisibilityService.hasProfilePicture(user.id);
        if (!hasProfilePic) { setIsLoadingVisibility(false); return; }
      }
      const success = await UserVisibilityService.setProfileVisibility(user.id, checked);
      if (success) {
        await updateCurrentUserSettingsPreferences({ is_public_profile: checked });
        setIsPublicProfile(checked);
      } else {
        throw new Error('Failed to update visibility');
      }
    } catch (error) {
      console.error('Error toggling profile visibility:', error);
    } finally {
      setIsLoadingVisibility(false);
    }
  };

  const handleTogglePushNotifications = async (checked: boolean) => {
    if (!user?.id) return;
    setIsLoadingPreferences(true);
    try {
      const updated = await updateCurrentUserSettingsPreferences({ enable_push_notifications: checked });
      if (updated) { setEnablePushNotifications(checked); } else { throw new Error('Failed to update preferences'); }
    } catch (error) {
      console.error('Error toggling push notifications:', error);
    } finally {
      setIsLoadingPreferences(false);
    }
  };

  const handleToggleEmails = async (checked: boolean) => {
    if (!user?.id) return;
    setIsLoadingPreferences(true);
    try {
      const updated = await updateCurrentUserSettingsPreferences({ enable_emails: checked });
      if (updated) { setEnableEmails(checked); } else { throw new Error('Failed to update preferences'); }
    } catch (error) {
      console.error('Error toggling email notifications:', error);
    } finally {
      setIsLoadingPreferences(false);
    }
  };

  useEffect(() => {
    if (isOpen && user?.id) {
      UserVisibilityService.getUserVisibilitySettings(user.id).then(settings => {
        if (settings) {
          setIsPublicProfile(settings.is_public_profile);
          setHasProfilePicture(settings.has_avatar);
        }
      }).catch(() => { setIsPublicProfile(true); setHasProfilePicture(true); });

      setIsLoadingPreferences(true);
      getCurrentUserSettingsPreferences().then(preferences => {
        if (preferences) {
          setEnablePushNotifications(preferences.enable_push_notifications);
          setEnableEmails(preferences.enable_emails);
          if (preferences.is_public_profile !== undefined) setIsPublicProfile(preferences.is_public_profile);
        }
      }).catch(console.error).finally(() => setIsLoadingPreferences(false));

      // Fetch display name, avatar, verification in one query
      supabase
        .from('users')
        .select('account_type, verified, name, avatar_url')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setAccountType(data.account_type || 'user');
            setIsVerified(data.verified || false);
            setUserDisplayName(data.name || '');
            setUserAvatarUrl(data.avatar_url || null);
          }
        });
    }
  }, [isOpen, user?.id]);

  // Derive initial for avatar fallback
  const nameInitial = (userDisplayName || userEmail || 'U')[0].toUpperCase();

  // ─── Sub-view title ────────────────────────────────────────────────────────
  const subViewTitle =
    view === 'onboarding-preferences' ? 'Profile & Preferences' :
    view === 'security-actions' ? 'Security' :
    view === 'verification' ? 'Verification' :
    view === 'parental-controls' ? 'Parental Controls' :
    view === 'delete-account' ? 'Delete Account' : 'Settings';

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="max-w-md w-[95vw] max-h-[90vh] p-0 overflow-hidden"
        style={{ display: 'flex', flexDirection: 'column', borderRadius: 20 }}
      >
        {/* ─── Header bar ────────────────────────────────────────────────── */}
        <DialogHeader className="px-5 pb-4 flex-shrink-0 border-b border-gray-100" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)' }}>
          <DialogTitle className="flex items-center gap-2 type-meta font-semibold">
            {view !== 'menu' && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1 var(--brand-pink-500) font-medium text-sm mr-1 -ml-1 hover:opacity-70 transition-opacity"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
            {view === 'menu' ? 'Settings' : subViewTitle}
          </DialogTitle>
        </DialogHeader>

        {/* ─── Scrollable body ────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch' }}>

          {/* ══════════════════════════════════════════════════════════════
              MAIN MENU VIEW
          ══════════════════════════════════════════════════════════════ */}
          {view === 'menu' && (
            <div className="px-4 py-5 space-y-5 pb-8">

              {/* ── Profile header card ─────────────────────────────────── */}
              <div className="bg-gradient-to-br from-pink-50 to-rose-50 rounded-2xl p-4 flex items-center gap-4 border border-pink-100/60">
                {/* Avatar */}
                <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-white shadow-sm">
                  {userAvatarUrl ? (
                    <img src={userAvatarUrl} alt={userDisplayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-synth-pink flex items-center justify-center">
                      <span className="text-xl font-bold var(--neutral-0)">{nameInitial}</span>
                    </div>
                  )}
                </div>
                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base truncate text-gray-900">
                    {userDisplayName || 'My Account'}
                  </p>
                  {userEmail && (
                    <p className="text-sm text-muted-foreground truncate">{userEmail}</p>
                  )}
                  {isVerified && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium mt-0.5">
                      <CheckCircle className="w-3 h-3" /> Verified
                    </span>
                  )}
                </div>
              </div>

              {/* ── Privacy & Notifications group ───────────────────────── */}
              <SettingsSection label="Privacy & Notifications">
                {/* Public Profile */}
                <ToggleRow
                  icon={isPublicProfile ? Eye : EyeOff}
                  iconBg="bg-pink-100"
                  iconColor="text-pink-500"
                  label="Public Profile"
                  description={
                    isPublicProfile
                      ? 'Visible to all users'
                      : 'Only visible to friends'
                  }
                  checked={isPublicProfile}
                  onCheckedChange={handleToggleProfileVisibility}
                  disabled={isLoadingVisibility}
                  warning={!hasProfilePicture ? 'Profile picture required to go public' : undefined}
                />
                <RowDivider />
                {/* Push Notifications */}
                <ToggleRow
                  icon={Bell}
                  iconBg="bg-violet-100"
                  iconColor="text-violet-500"
                  label="Push Notifications"
                  description={enablePushNotifications ? 'Enabled' : 'Disabled'}
                  checked={enablePushNotifications}
                  onCheckedChange={handleTogglePushNotifications}
                  disabled={isLoadingPreferences}
                />
                <RowDivider />
                {/* Email Notifications */}
                <ToggleRow
                  icon={Mail}
                  iconBg="bg-blue-100"
                  iconColor="var(--info-blue-500)"
                  label="Email Notifications"
                  description={enableEmails ? 'Enabled' : 'Disabled'}
                  checked={enableEmails}
                  onCheckedChange={handleToggleEmails}
                  disabled={isLoadingPreferences}
                />
              </SettingsSection>

              {/* ── Account group ────────────────────────────────────────── */}
              <SettingsSection label="Account">
                <NavRow
                  icon={User}
                  iconBg="bg-purple-100"
                  iconColor="var(--color-purple)"
                  label="Profile & Preferences"
                  description="Edit profile, music taste, location"
                  onClick={() => setView('onboarding-preferences')}
                />
                <RowDivider />
                <NavRow
                  icon={Lock}
                  iconBg="bg-indigo-100"
                  iconColor="var(--info-blue-500)"
                  label="Security"
                  description="Change password or email address"
                  onClick={() => setView('security-actions')}
                />
                <RowDivider />
                <NavRow
                  icon={CheckCircle}
                  iconBg="bg-emerald-100"
                  iconColor="text-emerald-500"
                  label="Verification Status"
                  description="Track your verification progress"
                  badge={isVerified ? { label: 'Verified', color: 'text-emerald-600 bg-emerald-50' } : undefined}
                  onClick={() => setView('verification')}
                />
                <RowDivider />
                <NavRow
                  icon={Shield}
                  iconBg="bg-amber-100"
                  iconColor="text-amber-500"
                  label="Parental Controls"
                  description="Age verification and safety settings"
                  onClick={() => setView('parental-controls')}
                />
              </SettingsSection>

              {/* ── Danger zone ──────────────────────────────────────────── */}
              <SettingsSection label="Danger Zone">
                <NavRow
                  icon={UserX}
                  iconBg="bg-red-100"
                  iconColor="var(--status-error-500)"
                  label="Delete Account"
                  description="Permanently remove your account"
                  labelColor="text-red-600"
                  onClick={() => { setDeleteAccountInput(''); setDeleteAccountError(null); setView('delete-account'); }}
                />
              </SettingsSection>

              {/* ── Sign Out ─────────────────────────────────────────────── */}
              <Button
                onClick={handleSignOut}
                disabled={isSigningOut}
                className="w-full bg-synth-pink hover:bg-pink-600 active:bg-pink-700 var(--neutral-0) font-semibold gap-2 h-11 rounded-xl shadow-sm transition-all active:scale-[0.98]"
              >
                <LogOut className="w-4 h-4" />
                {isSigningOut ? 'Signing out...' : 'Sign Out'}
              </Button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
              SUB-VIEWS (logic unchanged, same as before)
          ══════════════════════════════════════════════════════════════ */}

          {view === 'onboarding-preferences' && (
            <div className="px-5 py-5">
              <OnboardingPreferencesSettings onClose={handleBack} />
            </div>
          )}

          {view === 'verification' && (
            <div className="px-5 py-5">
              {user?.id && (
                <VerificationStatusCard
                  userId={user.id}
                  accountType={accountType}
                  verified={isVerified}
                />
              )}
            </div>
          )}

          {view === 'parental-controls' && (
            <div className="px-5 py-5">
              <ParentalControlsSettings />
            </div>
          )}

          {view === 'delete-account' && (
            <div className="px-5 py-6 space-y-5">
              {/* Warning card */}
              <div className="bg-red-50 rounded-2xl p-4 border border-red-100">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
                    <UserX className="w-5 h-5 var(--status-error-500)" />
                  </div>
                  <h3 className="font-bold text-red-700">Delete Account</h3>
                </div>
                <p className="text-sm text-red-600 leading-relaxed">
                  This action is <strong>permanent and cannot be undone.</strong> All your data will be removed from Synth.
                </p>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Type <strong>DELETE</strong> below to confirm you want to permanently delete your account.
                </p>
                {deleteAccountError && (
                  <div className="text-sm text-red-600 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {deleteAccountError}
                  </div>
                )}
                <Input
                  value={deleteAccountInput}
                  onChange={(e) => {
                    const next = e.target.value;
                    setDeleteAccountInput(next);
                    if (deleteAccountError && next === 'DELETE') setDeleteAccountError(null);
                  }}
                  disabled={isDeletingAccount}
                  placeholder='Type "DELETE" to confirm'
                  className="border-red-200 focus:ring-red-400"
                />
              </div>

              <Button
                onClick={handleDeleteAccount}
                disabled={isDeletingAccount || deleteAccountInput !== 'DELETE'}
                className="w-full bg-red-500 hover:bg-red-600 var(--neutral-0) h-11 rounded-xl font-semibold"
              >
                {isDeletingAccount ? 'Deleting...' : 'Delete My Account'}
              </Button>
            </div>
          )}

          {view === 'security-actions' && (
            <div className="px-5 py-6 space-y-6">
              {/* Current email display */}
              {userEmail && (
                <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <AtSign className="w-4 h-4 var(--info-blue-500)" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Signed in as</p>
                    <p className="text-sm font-medium truncate">{userEmail}</p>
                  </div>
                </div>
              )}

              {/* Change Email */}
              <div className="space-y-3">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                    <AtSign className="w-4.5 h-4.5 var(--info-blue-500)" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">Change Email</h4>
                    <p className="text-xs text-muted-foreground">You'll receive a confirmation at the new address</p>
                  </div>
                </div>
                <Label htmlFor="new-email" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  New Email Address
                </Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="Enter new email address"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={isChangingEmail}
                  className="rounded-xl"
                />
                <Button
                  onClick={handleChangeEmail}
                  disabled={isChangingEmail || !newEmail.trim() || newEmail === userEmail}
                  className="w-full h-11 rounded-xl bg-synth-pink hover:bg-pink-600 var(--neutral-0) font-semibold"
                >
                  {isChangingEmail ? 'Sending...' : 'Send Confirmation Email'}
                </Button>
              </div>

              <Separator />

              {/* Reset Password */}
              <div className="space-y-3">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
                    <Key className="w-4.5 h-4.5 var(--info-blue-500)" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm">Reset Password</h4>
                    <p className="text-xs text-muted-foreground">A reset link will be sent to your email</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={handleResetPassword}
                  disabled={isResettingPassword}
                  className="w-full h-11 rounded-xl border-gray-200 font-semibold"
                >
                  {isResettingPassword ? 'Sending...' : 'Send Password Reset Link'}
                </Button>
              </div>

              <Separator />

              {/* Security note */}
              <div className="bg-blue-50 rounded-xl p-4 flex items-start gap-3 border border-blue-100">
                <Info className="w-4 h-4 var(--info-blue-500) mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-blue-900 mb-0.5">Security emails can't be disabled</p>
                  <p className="text-blue-700 text-xs leading-relaxed">
                    Account confirmation, password resets, and security alerts are always sent for your protection. Check your spam folder if you don't see them.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── Reusable layout sub-components ──────────────────────────────────────────

function SettingsSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 mb-2">
        {label}
      </p>
      <div className="rounded-2xl overflow-hidden bg-white border border-gray-100 shadow-sm">
        {children}
      </div>
    </div>
  );
}

function RowDivider() {
  return <div className="h-px bg-gray-100 ml-[64px]" />;
}

interface ToggleRowProps {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  warning?: string;
}

function ToggleRow({ icon: Icon, iconBg, iconColor, label, description, checked, onCheckedChange, disabled, warning }: ToggleRowProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-[18px] h-[18px] ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0 mr-2">
        <p className="font-medium text-sm text-gray-900">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {warning && (
          <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
            <AlertCircle className="w-3 h-3" /> {warning}
          </p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

interface NavRowProps {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  description: string;
  labelColor?: string;
  badge?: { label: string; color: string };
  onClick: () => void;
}

function NavRow({ icon: Icon, iconBg, iconColor, label, description, labelColor, badge, onClick }: NavRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
    >
      <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-[18px] h-[18px] ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`font-medium text-sm ${labelColor || 'text-gray-900'}`}>{label}</p>
          {badge && (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${badge.color}`}>
              {badge.label}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
    </button>
  );
}
