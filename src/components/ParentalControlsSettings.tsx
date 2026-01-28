import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, MessageSquare, Eye, EyeOff, Info, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { AgeVerificationCard } from '@/components/AgeVerificationCard';
import type { User } from '@/types/database';

export const ParentalControlsSettings = () => {
  const { user: authUser } = useAuth();
  const { toast } = useToast();
  
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [age, setAge] = useState<number | null>(null);
  
  const [controls, setControls] = useState({
    parental_controls_enabled: false,
    dm_restricted: false,
    is_public_profile: true,
  });

  useEffect(() => {
    if (authUser?.id) {
      fetchUserData();
    }
  }, [authUser?.id]);

  const fetchUserData = async () => {
    if (!authUser?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('users')
        .select('birthday, age_verified, is_minor, parental_controls_enabled, dm_restricted, is_public_profile')
        .eq('user_id', authUser.id)
        .single();

      if (error) {
        console.error('Error fetching user data:', error);
        toast({
          title: "Error",
          description: "Failed to load parental controls settings",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      if (data) {
        setUserData(data as User);
        
        // Calculate age
        if (data.birthday) {
          const birthDate = new Date(data.birthday);
          const today = new Date();
          let calculatedAge = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            calculatedAge--;
          }
          
          setAge(calculatedAge);
        }

        setControls({
          parental_controls_enabled: data.parental_controls_enabled ?? false,
          dm_restricted: data.dm_restricted ?? false,
          is_public_profile: data.is_public_profile ?? true,
        });
      }
    } catch (error) {
      console.error('Error in fetchUserData:', error);
      toast({
        title: "Error",
        description: "Failed to load settings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (field: keyof typeof controls, value: boolean) => {
    if (!authUser?.id) return;

    // Optimistically update UI
    setControls(prev => ({ ...prev, [field]: value }));

    try {
      const { error } = await supabase
        .from('users')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('user_id', authUser.id);

      if (error) {
        // Revert on error
        setControls(prev => ({ ...prev, [field]: !value }));
        throw error;
      }

      toast({
        title: "Settings Updated",
        description: `Your ${field === 'dm_restricted' ? 'DM restrictions' : field === 'is_public_profile' ? 'privacy' : 'parental controls'} have been updated.`,
      });
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
      toast({
        title: "Error",
        description: `Failed to update ${field}. Please try again.`,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  const isMinor = userData?.is_minor ?? false;
  const hasControlsEnabled = controls.parental_controls_enabled || isMinor;
  const showControls = hasControlsEnabled;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Parental Controls</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage safety settings and content restrictions for your account
        </p>
      </div>

      <Separator />

      {/* Age Verification Card */}
      <AgeVerificationCard />

      {/* Parental Controls Section */}
      {showControls ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Safety Controls
            </CardTitle>
            <CardDescription>
              {isMinor 
                ? "These controls are automatically enabled for accounts under 18. You can adjust them below."
                : "Enable these controls to restrict content and interactions on your account."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* DM Restrictions */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  <Label htmlFor="dm-restricted" className="font-semibold cursor-pointer">
                    Restrict Direct Messages
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Only allow direct messages from users you follow back (mutual followers)
                </p>
              </div>
              <Switch
                id="dm-restricted"
                checked={controls.dm_restricted}
                onCheckedChange={(checked) => handleToggle('dm_restricted', checked)}
                disabled={saving}
              />
            </div>

            {/* Private Account */}
            <div className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-muted/30">
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  {controls.is_public_profile ? (
                    <Eye className="w-5 h-5 text-primary" />
                  ) : (
                    <EyeOff className="w-5 h-5 text-primary" />
                  )}
                  <Label htmlFor="private-account" className="font-semibold cursor-pointer">
                    Private Account
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Require approval for new followers. Your profile will only be visible to approved followers.
                </p>
              </div>
              <Switch
                id="private-account"
                checked={!controls.is_public_profile}
                onCheckedChange={(checked) => handleToggle('is_public_profile', !checked)}
                disabled={saving}
              />
            </div>

            {/* Info Banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <h4 className="font-semibold text-sm text-blue-900">About Parental Controls</h4>
                  <p className="text-sm text-blue-700">
                    These controls help protect your account by restricting who can contact you and what content you see.
                    {isMinor && " As an account under 18, these controls are automatically enabled for your safety."}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="text-center space-y-4">
              <Shield className="w-12 h-12 text-muted-foreground mx-auto" />
              <div>
                <h4 className="font-semibold mb-2">Parental Controls Not Enabled</h4>
                <p className="text-sm text-muted-foreground">
                  Parental controls are available for accounts under 18 or can be manually enabled.
                  {age !== null && age >= 18 && " Since you're 18 or older, these controls are optional."}
                </p>
              </div>
              {age !== null && age >= 18 && (
                <Button
                  variant="outline"
                  onClick={() => handleToggle('parental_controls_enabled', true)}
                  disabled={saving}
                >
                  Enable Parental Controls
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
