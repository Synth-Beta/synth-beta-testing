import { useState, useEffect } from 'react';
import { Mail, Shield, Bell, Check, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  getCurrentUserEmailPreferences,
  updateCurrentUserEmailPreferences,
} from '@/services/emailPreferencesService';
import type { EmailPreferences, WeekDay } from '@/types/emailPreferences';
import { WEEK_DAYS, EMAIL_TYPES } from '@/types/emailPreferences';

export const EmailPreferencesSettings = () => {
  const [preferences, setPreferences] = useState<EmailPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { toast } = useToast();

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    setIsLoading(true);
    try {
      const prefs = await getCurrentUserEmailPreferences();
      if (prefs) {
        setPreferences(prefs);
      }
    } catch (error) {
      console.error('Failed to load email preferences:', error);
      toast({
        title: 'Error',
        description: 'Failed to load email preferences. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!preferences || !hasChanges) return;

    setIsSaving(true);
    try {
      const updated = await updateCurrentUserEmailPreferences({
        enable_event_reminders: preferences.enable_event_reminders,
        enable_match_notifications: preferences.enable_match_notifications,
        enable_review_notifications: preferences.enable_review_notifications,
        enable_weekly_digest: preferences.enable_weekly_digest,
        weekly_digest_day: preferences.weekly_digest_day,
        event_reminder_days: preferences.event_reminder_days,
      });

      if (updated) {
        setPreferences(updated);
        setHasChanges(false);
        toast({
          title: 'Preferences saved',
          description: 'Your email preferences have been updated successfully.',
        });
      }
    } catch (error) {
      console.error('Failed to save email preferences:', error);
      toast({
        title: 'Error',
        description: 'Failed to save preferences. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updatePreference = <K extends keyof EmailPreferences>(
    key: K,
    value: EmailPreferences[K]
  ) => {
    if (!preferences) return;
    setPreferences({ ...preferences, [key]: value });
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!preferences) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Failed to load email preferences.</p>
        <Button onClick={loadPreferences} variant="outline" className="mt-4">
          Try Again
        </Button>
      </div>
    );
  }

  const authEmails = EMAIL_TYPES.filter((e) => e.category === 'auth');
  const notificationEmails = EMAIL_TYPES.filter((e) => e.category === 'notification');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Mail className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">Email Preferences</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Manage which emails you receive from Synth
        </p>
      </div>

      <Separator />

      {/* Account & Security Emails */}
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <Shield className="w-5 h-5 text-primary mt-0.5" />
          <div>
            <h4 className="font-semibold">Account & Security Emails</h4>
            <p className="text-sm text-muted-foreground">
              These emails are required for account security and cannot be disabled
            </p>
          </div>
        </div>

        <div className="space-y-3 pl-7">
          {authEmails.map((emailType) => (
            <div
              key={emailType.id}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <Label className="font-medium cursor-default">{emailType.name}</Label>
                </div>
                <p className="text-xs text-muted-foreground mt-1 ml-6">
                  {emailType.description}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">Required</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Notification Emails */}
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <Bell className="w-5 h-5 text-primary mt-0.5" />
          <div>
            <h4 className="font-semibold">Notification Emails</h4>
            <p className="text-sm text-muted-foreground">
              Customize which notifications you want to receive
            </p>
          </div>
        </div>

        <div className="space-y-4 pl-7">
          {/* Event Reminders */}
          <div className="space-y-3 p-4 rounded-lg border">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label htmlFor="event-reminders" className="font-medium cursor-pointer">
                  Event Reminders
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Get notified before events you're interested in
                </p>
              </div>
              <Switch
                id="event-reminders"
                checked={preferences.enable_event_reminders}
                onCheckedChange={(checked) =>
                  updatePreference('enable_event_reminders', checked)
                }
              />
            </div>

            {preferences.enable_event_reminders && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <Info className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Remind me</span>
                <Select
                  value={preferences.event_reminder_days.toString()}
                  onValueChange={(value) =>
                    updatePreference('event_reminder_days', parseInt(value))
                  }
                >
                  <SelectTrigger className="w-24 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Same day</SelectItem>
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="2">2 days</SelectItem>
                    <SelectItem value="3">3 days</SelectItem>
                    <SelectItem value="7">1 week</SelectItem>
                    <SelectItem value="14">2 weeks</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">before event</span>
              </div>
            )}
          </div>

          {/* Match Notifications */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex-1">
              <Label htmlFor="match-notifications" className="font-medium cursor-pointer">
                Match Notifications
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                When you match with someone at an event
              </p>
            </div>
            <Switch
              id="match-notifications"
              checked={preferences.enable_match_notifications}
              onCheckedChange={(checked) =>
                updatePreference('enable_match_notifications', checked)
              }
            />
          </div>

          {/* Review Notifications */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="flex-1">
              <Label htmlFor="review-notifications" className="font-medium cursor-pointer">
                Review Notifications
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                When someone reviews an event you're interested in
              </p>
            </div>
            <Switch
              id="review-notifications"
              checked={preferences.enable_review_notifications}
              onCheckedChange={(checked) =>
                updatePreference('enable_review_notifications', checked)
              }
            />
          </div>

          {/* Weekly Digest */}
          <div className="space-y-3 p-4 rounded-lg border">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label htmlFor="weekly-digest" className="font-medium cursor-pointer">
                  Weekly Digest
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Weekly summary of events, matches, and recommendations
                </p>
              </div>
              <Switch
                id="weekly-digest"
                checked={preferences.enable_weekly_digest}
                onCheckedChange={(checked) => updatePreference('enable_weekly_digest', checked)}
              />
            </div>

            {preferences.enable_weekly_digest && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <Info className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Send every</span>
                <Select
                  value={preferences.weekly_digest_day}
                  onValueChange={(value: WeekDay) =>
                    updatePreference('weekly_digest_day', value)
                  }
                >
                  <SelectTrigger className="w-32 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEK_DAYS.map((day) => (
                      <SelectItem key={day.value} value={day.value}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="flex items-center justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={loadPreferences} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Preferences'
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

