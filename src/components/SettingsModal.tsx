import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LogOut, User, Bell, Shield, Mail, Key, AtSign, Eye, EyeOff, AlertCircle, CheckCircle, ArrowLeft, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { OnboardingPreferencesSettings } from '@/components/OnboardingPreferencesSettings';
import { supabase } from '@/integrations/supabase/client';
import { UserVisibilityService } from '@/services/userVisibilityService';
import { useAuth } from '@/hooks/useAuth';
import { VerificationStatusCard } from '@/components/verification/VerificationStatusCard';
import { 
  getUserSettingsPreferences, 
  updateUserSettingsPreferences,
  getCurrentUserSettingsPreferences,
  updateCurrentUserSettingsPreferences 
} from '@/services/userSettingsPreferencesService';
import { useViewTracking } from '@/hooks/useViewTracking';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignOut: () => void;
  userEmail?: string;
}

export const SettingsModal = ({ isOpen, onClose, onSignOut, userEmail }: SettingsModalProps) => {
  // Track settings view when modal opens
  useViewTracking('view', 'settings', { source: 'settings' }, undefined, { enabled: isOpen });

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [view, setView] = useState<'menu' | 'onboarding-preferences' | 'security-actions' | 'verification'>('menu');
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
  const { toast } = useToast();
  const { user } = useAuth();

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await onSignOut();
      onClose();
      toast({
        title: "Signed out successfully",
        description: "You've been signed out of your account.",
      });
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleComingSoon = (feature: string) => {
    toast({
      title: "Coming Soon",
      description: `${feature} will be available in a future update.`,
    });
  };

  const handleClose = () => {
    setView('menu');
    setNewEmail('');
    onClose();
  };

  const handleBack = () => {
    setView('menu');
    setNewEmail('');
  };

  const handleResetPassword = async () => {
    if (!userEmail) {
      toast({
        title: 'Error',
        description: 'No email address found for this account.',
        variant: 'destructive',
      });
      return;
    }

    setIsResettingPassword(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo: 'https://synth-beta-testing.vercel.app/reset-password',
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Password reset email sent',
        description: 'Check your email for instructions to reset your password.',
      });
    } catch (error: any) {
      console.error('Error sending password reset:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send password reset email.',
        variant: 'destructive',
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a new email address.',
        variant: 'destructive',
      });
      return;
    }

    if (newEmail === userEmail) {
      toast({
        title: 'Error',
        description: 'The new email address must be different from your current email.',
        variant: 'destructive',
      });
      return;
    }

    setIsChangingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail,
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Email change confirmation sent',
        description: `Check ${newEmail} for a confirmation link to complete the change.`,
      });
      
      setNewEmail('');
    } catch (error: any) {
      console.error('Error changing email:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send email change confirmation.',
        variant: 'destructive',
      });
    } finally {
      setIsChangingEmail(false);
    }
  };

  const handleToggleProfileVisibility = async (checked: boolean) => {
    if (!user?.id) return;

    setIsLoadingVisibility(true);
    try {
      // If trying to make profile public, check if user has a profile picture
      if (checked) {
        const hasProfilePic = await UserVisibilityService.hasProfilePicture(user.id);
        if (!hasProfilePic) {
          toast({
            title: 'Profile Picture Required',
            description: 'You must upload a profile picture before making your profile public. Go to Edit Profile to add a photo.',
            variant: 'destructive',
          });
          setIsLoadingVisibility(false);
          return;
        }
      }

      // Update both UserVisibilityService and user_settings_preferences
      const success = await UserVisibilityService.setProfileVisibility(user.id, checked);
      
      if (success) {
        // Also update in user_settings_preferences
        await updateCurrentUserSettingsPreferences({ is_public_profile: checked });
        
        setIsPublicProfile(checked);
        toast({
          title: checked ? 'Profile is now public' : 'Profile is now private',
          description: checked 
            ? 'Your profile is visible to all users.' 
            : 'Your profile is only visible to your friends.',
        });
      } else {
        throw new Error('Failed to update visibility');
      }
    } catch (error) {
      console.error('Error toggling profile visibility:', error);
      toast({
        title: 'Error',
        description: 'Failed to update profile visibility. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingVisibility(false);
    }
  };

  const handleTogglePushNotifications = async (checked: boolean) => {
    if (!user?.id) return;

    setIsLoadingPreferences(true);
    try {
      const updated = await updateCurrentUserSettingsPreferences({
        enable_push_notifications: checked,
      });

      if (updated) {
        setEnablePushNotifications(checked);
        toast({
          title: checked ? 'Push notifications enabled' : 'Push notifications disabled',
          description: checked 
            ? 'You will receive push notifications.' 
            : 'Push notifications are now disabled.',
        });
      } else {
        throw new Error('Failed to update preferences');
      }
    } catch (error) {
      console.error('Error toggling push notifications:', error);
      toast({
        title: 'Error',
        description: 'Failed to update push notification preferences. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingPreferences(false);
    }
  };

  const handleToggleEmails = async (checked: boolean) => {
    if (!user?.id) return;

    setIsLoadingPreferences(true);
    try {
      const updated = await updateCurrentUserSettingsPreferences({
        enable_emails: checked,
      });

      if (updated) {
        setEnableEmails(checked);
        toast({
          title: checked ? 'Email notifications enabled' : 'Email notifications disabled',
          description: checked 
            ? 'You will receive email notifications.' 
            : 'Email notifications are now disabled.',
        });
      } else {
        throw new Error('Failed to update preferences');
      }
    } catch (error) {
      console.error('Error toggling email notifications:', error);
      toast({
        title: 'Error',
        description: 'Failed to update email preferences. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingPreferences(false);
    }
  };

  // Load profile visibility settings, verification status, and user preferences when modal opens
  useEffect(() => {
    if (isOpen && user?.id) {
      // Load visibility settings
      UserVisibilityService.getUserVisibilitySettings(user.id).then(settings => {
        if (settings) {
          setIsPublicProfile(settings.is_public_profile);
          setHasProfilePicture(settings.has_avatar);
        }
      }).catch(error => {
        console.error('Error loading visibility settings:', error);
        // Set default values if loading fails
        setIsPublicProfile(true);
        setHasProfilePicture(true);
      });

      // Load user settings preferences
      setIsLoadingPreferences(true);
      getCurrentUserSettingsPreferences().then(preferences => {
        if (preferences) {
          setEnablePushNotifications(preferences.enable_push_notifications);
          setEnableEmails(preferences.enable_emails);
          // Also sync public profile from preferences if available
          if (preferences.is_public_profile !== undefined) {
            setIsPublicProfile(preferences.is_public_profile);
          }
        }
      }).catch(error => {
        console.error('Error loading user settings preferences:', error);
      }).finally(() => {
        setIsLoadingPreferences(false);
      });

      // Fetch verification status
      supabase
        .from('users')
        .select('account_type, verified')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setAccountType(data.account_type || 'user');
            setIsVerified(data.verified || false);
          }
        });
    }
  }, [isOpen, user?.id]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {(view !== 'menu') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="mr-2 -ml-2"
              >
                ← Back
              </Button>
            )}
            {view === 'menu' && <Shield className="w-5 h-5" />}
            {view === 'menu' ? 'Settings' : 
             view === 'onboarding-preferences' ? 'Profile & Preferences' :
             view === 'security-actions' ? 'Security Actions' :
             view === 'verification' ? 'Verification Status' : 'Settings'}
          </DialogTitle>
        </DialogHeader>
        
        {view === 'menu' ? (
          <div className="space-y-4">
            {/* User Info */}
            {userEmail && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span>Signed in as: {userEmail}</span>
                </div>
              </div>
            )}

            <Separator />

            {/* Profile Visibility Toggle */}
            <div className="p-4 bg-muted/30 rounded-lg border">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3 flex-1">
                  {isPublicProfile ? (
                    <Eye className="w-5 h-5 text-primary mt-0.5" />
                  ) : (
                    <EyeOff className="w-5 h-5 text-muted-foreground mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">Public Profile</div>
                    <div className="text-sm text-muted-foreground">
                      {isPublicProfile 
                        ? 'Your profile is visible to all users' 
                        : 'Your profile is only visible to friends'}
                    </div>
                    {!hasProfilePicture && (
                      <div className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Profile picture required to make profile public
                      </div>
                    )}
                  </div>
                </div>
                <Switch
                  checked={isPublicProfile}
                  onCheckedChange={handleToggleProfileVisibility}
                  disabled={isLoadingVisibility}
                />
              </div>
            </div>

            <Separator />

            {/* Notification Preferences */}
            <div className="space-y-4">
              <div className="p-4 bg-muted/30 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <Bell className="w-5 h-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium">Push Notifications</div>
                      <div className="text-sm text-muted-foreground">
                        {enablePushNotifications 
                          ? 'You will receive push notifications' 
                          : 'Push notifications are disabled'}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={enablePushNotifications}
                    onCheckedChange={handleTogglePushNotifications}
                    disabled={isLoadingPreferences}
                  />
                </div>
              </div>

              <div className="p-4 bg-muted/30 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <Mail className="w-5 h-5 text-primary mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium">Email Notifications</div>
                      <div className="text-sm text-muted-foreground">
                        {enableEmails 
                          ? 'You will receive email notifications' 
                          : 'Email notifications are disabled'}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={enableEmails}
                    onCheckedChange={handleToggleEmails}
                    disabled={isLoadingPreferences}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Settings Options */}
            <div className="space-y-2">
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-12"
                onClick={() => setView('onboarding-preferences')}
              >
                <User className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-medium">Profile & Preferences</div>
                  <div className="text-sm text-muted-foreground">Manage your profile information and preferences</div>
                </div>
              </Button>


              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-12"
                onClick={() => setView('security-actions')}
              >
                <Shield className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-medium">Security Actions</div>
                  <div className="text-sm text-muted-foreground">Change password, email, and security settings</div>
                </div>
              </Button>

              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-12"
                onClick={() => setView('verification')}
              >
                <CheckCircle className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-medium flex items-center gap-2">
                    Verification Status
                    {isVerified && <span className="text-xs text-green-600">✓ Verified</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">Track your verification progress</div>
                </div>
              </Button>

            </div>

            <Separator />

            {/* Sign Out Button */}
            <Button
              variant="destructive"
              className="w-full gap-3 h-12"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              <LogOut className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">
                  {isSigningOut ? 'Signing out...' : 'Sign Out'}
                </div>
                <div className="text-sm opacity-80">
                  {isSigningOut ? 'Please wait...' : 'Sign out of your account'}
                </div>
              </div>
            </Button>
          </div>
        ) : view === 'onboarding-preferences' ? (
          <OnboardingPreferencesSettings onClose={handleBack} />
        ) : view === 'verification' ? (
          <div className="p-4">
            {user?.id && (
              <VerificationStatusCard
                userId={user.id}
                accountType={accountType}
                verified={isVerified}
              />
            )}
          </div>
        ) : view === 'security-actions' ? (
          <div className="space-y-6">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Security Actions</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Manage your account security settings
              </p>
            </div>

            <Separator />

            {/* Current Email Display */}
            {userEmail && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AtSign className="w-4 h-4" />
                  <span>Current email: <strong>{userEmail}</strong></span>
                </div>
              </div>
            )}

            {/* Change Email Section */}
            <div className="space-y-4">
              <h4 className="font-semibold flex items-center gap-2">
                <AtSign className="w-5 h-5" />
                Change Email Address
              </h4>
              <p className="text-sm text-muted-foreground">
                Change your email address. You'll receive a confirmation email at the new address.
              </p>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="new-email">New Email Address</Label>
                  <Input
                    id="new-email"
                    type="email"
                    placeholder="Enter new email address"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    disabled={isChangingEmail}
                  />
                </div>
                <Button
                  onClick={handleChangeEmail}
                  disabled={isChangingEmail || !newEmail.trim()}
                  className="w-full"
                >
                  {isChangingEmail ? 'Sending...' : 'Send Email Change Confirmation'}
                </Button>
              </div>
            </div>

            <Separator />

            {/* Reset Password Section */}
            <div className="space-y-4">
              <h4 className="font-semibold flex items-center gap-2">
                <Key className="w-5 h-5" />
                Reset Password
              </h4>
              <p className="text-sm text-muted-foreground">
                Send a password reset link to your email address.
              </p>
              <Button
                variant="outline"
                onClick={handleResetPassword}
                disabled={isResettingPassword}
                className="w-full"
              >
                {isResettingPassword ? 'Sending...' : 'Send Password Reset Email'}
              </Button>
            </div>

            <Separator />

            {/* Info Section */}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900 mb-1">About Security Emails</p>
                  <p className="text-blue-700">
                    All security emails are sent automatically and cannot be disabled for your account protection. 
                    Check your email (including spam folder) for confirmation links.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
