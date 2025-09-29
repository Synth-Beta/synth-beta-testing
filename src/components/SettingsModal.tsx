import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { LogOut, User, Bell, Shield, HelpCircle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSignOut: () => void;
  userEmail?: string;
}

export const SettingsModal = ({ isOpen, onClose, onSignOut, userEmail }: SettingsModalProps) => {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { toast } = useToast();

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Settings
          </DialogTitle>
        </DialogHeader>
        
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

          {/* Settings Options */}
          <div className="space-y-2">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12"
              onClick={() => handleComingSoon('Profile Settings')}
            >
              <User className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Profile Settings</div>
                <div className="text-sm text-muted-foreground">Manage your profile information</div>
              </div>
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12"
              onClick={() => handleComingSoon('Notifications')}
            >
              <Bell className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Notifications</div>
                <div className="text-sm text-muted-foreground">Control your notification preferences</div>
              </div>
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12"
              onClick={() => handleComingSoon('Privacy & Security')}
            >
              <Shield className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Privacy & Security</div>
                <div className="text-sm text-muted-foreground">Manage your privacy settings</div>
              </div>
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12"
              onClick={() => handleComingSoon('Help & Support')}
            >
              <HelpCircle className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">Help & Support</div>
                <div className="text-sm text-muted-foreground">Get help and contact support</div>
              </div>
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-12"
              onClick={() => handleComingSoon('About')}
            >
              <Info className="w-5 h-5" />
              <div className="text-left">
                <div className="font-medium">About</div>
                <div className="text-sm text-muted-foreground">App version and information</div>
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
      </DialogContent>
    </Dialog>
  );
};
