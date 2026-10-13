import { Redirect } from 'expo-router';

/**
 * Pick Five sends users here (https://join.getsynth.app/connect/pickfive or synth://connect/pickfive)
 * from their Connect button and after linking.
 */
export default function ConnectPickFiveLink() {
  return <Redirect href="/settings/pickfive" />;
}
