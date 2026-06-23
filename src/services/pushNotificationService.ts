/**
 * Push Notifications Service
 * Handles browser push notifications for matches
 */

export class PushNotificationService {
  private static isSupported = 'Notification' in window;
  private static permission: NotificationPermission = 'default';

  /**
   * Request notification permission
   */
  static async requestPermission(): Promise<boolean> {
    if (!this.isSupported) {
      console.log('Push notifications not supported');
      return false;
    }

    try {
      this.permission = await Notification.requestPermission();
      return this.permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  /**
   * Check if notifications are enabled
   */
  static isEnabled(): boolean {
    return this.isSupported && this.permission === 'granted';
  }

  /**
   * Show a match notification
   */
  static showMatchNotification(matchData: {
    userName: string;
    eventTitle: string;
    eventArtist?: string;
  }): void {
    if (!this.isEnabled()) return;

    const notification = new Notification('🎉 It\'s a Match!', {
      body: `You and ${matchData.userName} both want to meet up at ${matchData.eventTitle}!`,
      icon: '/favicon.png',
      badge: '/favicon.png',
      tag: 'match-notification',
      requireInteraction: true,
      actions: [
        {
          action: 'view',
          title: 'View Match'
        },
        {
          action: 'chat',
          title: 'Start Chat'
        }
      ]
    });

    notification.onclick = () => {
      window.focus();
      // Navigate to matches page
      window.location.href = '/matches';
      notification.close();
    };
  }

  /**
   * Show a message notification
   */
  static showMessageNotification(messageData: {
    senderName: string;
    message: string;
    chatId: string;
  }): void {
    if (!this.isEnabled()) return;

    const notification = new Notification(`Message from ${messageData.senderName}`, {
      body: messageData.message,
      icon: '/favicon.png',
      badge: '/favicon.png',
      tag: `message-${messageData.chatId}`,
      requireInteraction: false
    });

    notification.onclick = () => {
      window.focus();
      // Navigate to chat
      window.location.href = `/chat/${messageData.chatId}`;
      notification.close();
    };
  }

  /**
   * Initialize push notifications
   */
  static async initialize(): Promise<void> {
    if (!this.isSupported) return;

    // Check current permission
    this.permission = Notification.permission;

    // If permission is default, show a subtle prompt
    if (this.permission === 'default') {
      // You could show a UI prompt here instead of auto-requesting
      console.log('Notification permission not set. Consider showing a UI prompt.');
    }
  }

  /**
   * Subscribe to Service Worker for background notifications
   */
  static async subscribeToServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration);
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
}

// Auto-initialize when imported
if (typeof window !== 'undefined') {
  PushNotificationService.initialize();
}
