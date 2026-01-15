import { useState, useEffect } from 'react';
import { Bell, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { PushNotificationService } from '@/services/pushNotificationService';

interface PushNotificationsSettingsProps {
  onClose?: () => void;
}

export const PushNotificationsSettings = ({ onClose }: PushNotificationsSettingsProps) => {
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');
  const [isRequesting, setIsRequesting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Check current permission status
    if ('Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
  }, []);

  const handleRequestPermission = async () => {
    if (!('Notification' in window)) {
      toast({
        title: 'Not Supported',
        description: 'Push notifications are not supported in this browser.',
        variant: 'destructive',
      });
      return;
    }

    setIsRequesting(true);
    try {
      const granted = await PushNotificationService.requestPermission();
      
      if (granted) {
        setPermissionStatus('granted');
        toast({
          title: 'Notifications Enabled',
          description: 'You will now receive push notifications.',
        });
      } else {
        setPermissionStatus('denied');
        toast({
          title: 'Permission Denied',
          description: 'Push notifications have been blocked. You can enable them in your browser settings.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      toast({
        title: 'Error',
        description: 'Failed to request notification permission.',
        variant: 'destructive',
      });
    } finally {
      setIsRequesting(false);
    }
  };

  const getStatusIcon = () => {
    switch (permissionStatus) {
      case 'granted':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'denied':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-amber-600" />;
    }
  };

  const getStatusText = () => {
    switch (permissionStatus) {
      case 'granted':
        return 'Enabled';
      case 'denied':
        return 'Blocked';
      default:
        return 'Not Set';
    }
  };

  const getStatusDescription = () => {
    switch (permissionStatus) {
      case 'granted':
        return 'You will receive push notifications for matches, messages, and other important updates.';
      case 'denied':
        return 'Push notifications are blocked. Enable them in your browser settings to receive notifications.';
      default:
        return 'Push notifications are not enabled. Click the button below to enable them.';
    }
  };

  if (!('Notification' in window)) {
    return (
      <div className="p-4 space-y-4">
        <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900">Not Supported</p>
              <p className="text-sm text-amber-700 mt-1">
                Push notifications are not supported in this browser.
              </p>
            </div>
          </div>
        </div>
        {onClose && (
          <Button onClick={onClose} variant="outline" className="w-full">
            Back
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Section */}
      <div className="p-4 bg-muted/30 rounded-lg border">
        <div className="flex items-start gap-3">
          {getStatusIcon()}
          <div className="flex-1">
            <div className="font-medium">Notification Status: {getStatusText()}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {getStatusDescription()}
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Enable/Disable Button */}
      {permissionStatus !== 'granted' && (
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold mb-2">Enable Push Notifications</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Enable push notifications to stay updated with matches, messages, and important events.
            </p>
            <Button
              onClick={handleRequestPermission}
              disabled={isRequesting || permissionStatus === 'denied'}
              className="w-full"
            >
              {isRequesting ? 'Requesting...' : 'Enable Push Notifications'}
            </Button>
          </div>
        </div>
      )}

      {permissionStatus === 'granted' && (
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
            <div>
              <p className="font-medium text-green-900">Notifications Active</p>
              <p className="text-sm text-green-700 mt-1">
                You're all set! You'll receive push notifications for important updates.
              </p>
            </div>
          </div>
        </div>
      )}

      {permissionStatus === 'denied' && (
        <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
          <div className="flex items-start gap-2">
            <Info className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900">Permission Blocked</p>
              <p className="text-sm text-amber-700 mt-1">
                To enable push notifications, please:
              </p>
              <ol className="list-decimal list-inside text-sm text-amber-700 mt-2 space-y-1">
                <li>Open your browser settings</li>
                <li>Navigate to Site Settings or Permissions</li>
                <li>Find this site and enable notifications</li>
                <li>Refresh the page</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      <Separator />

      {/* Info Section */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-blue-900 mb-1">About Push Notifications</p>
            <p className="text-blue-700">
              Push notifications help you stay connected with matches, messages, and important event updates. 
              You can manage these settings at any time from your browser.
            </p>
          </div>
        </div>
      </div>

      {onClose && (
        <Button onClick={onClose} variant="outline" className="w-full">
          Back
        </Button>
      )}
    </div>
  );
};

