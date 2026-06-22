import React from 'react';
import { NotificationsFeed } from '../src/components/notifications/NotificationsFeed';

export default function NotificationsScreen() {
  return <NotificationsFeed friendsOnly={false} />;
}
