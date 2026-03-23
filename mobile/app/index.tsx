import { Redirect } from 'expo-router';

/** Root entry: auth + onboarding redirects run in `app/_layout.tsx`; send first paint to tabs. */
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
