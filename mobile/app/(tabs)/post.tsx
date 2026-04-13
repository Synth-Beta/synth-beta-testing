import React from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { EventReviewFlow } from '../../src/components/review/EventReviewFlow';

export default function PostScreen() {
  const router = useRouter();

  return (
    <EventReviewFlow
      initialEventId={null}
      prefill={null}
      onClose={() => router.replace('/(tabs)/')}
      onSubmitted={(eid) => {
        Alert.alert('Thanks!', 'Your review was posted.', [
          {
            text: 'Done',
            onPress: () => (eid ? router.replace(`/event/${eid}`) : router.replace('/(tabs)/')),
          },
          {
            text: 'Rank in My Events',
            onPress: () => router.replace('/my-events?tab=rankings'),
          },
        ]);
      }}
    />
  );
}
