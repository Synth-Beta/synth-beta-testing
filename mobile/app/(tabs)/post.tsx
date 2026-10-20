import React from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { EventReviewFlow } from '../../src/components/review/EventReviewFlow';
import { reportTourAction } from '../../lib/tourProgress';

export default function PostScreen() {
  const router = useRouter();

  return (
    <EventReviewFlow
      initialEventId={null}
      prefill={null}
      onClose={() => router.replace('/(tabs)')}
      onSubmitted={(eid) => {
        // App tour's review step: back to Home, where the tour banner says thanks and moves on.
        if (reportTourAction('review')) {
          router.replace('/(tabs)');
          return;
        }
        Alert.alert('Thanks!', 'Your review was posted.', [
          {
            text: 'Done',
            onPress: () => (eid ? router.replace(`/event/${eid}`) : router.replace('/(tabs)')),
          },
        ]);
      }}
    />
  );
}
