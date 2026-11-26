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
      reserveTabBar
      onClose={() => router.replace('/(tabs)')}
      onSubmitted={(eid) => {
        // App tutorial's review step: back to Home, where the tutorial says thanks and moves on.
        if (reportTourAction('review')) {
          router.replace('/(tabs)');
          return;
        }
        Alert.alert('Review posted', 'Thanks for sharing how the show went.', [
          {
            text: 'Done',
            onPress: () => (eid ? router.replace(`/event/${eid}`) : router.replace('/(tabs)')),
          },
        ]);
      }}
    />
  );
}
