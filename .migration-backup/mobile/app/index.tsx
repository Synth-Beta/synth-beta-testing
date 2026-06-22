import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { loadPendingShareLink } from '../lib/shareDeepLinkStorage';
import { AppLoadingSkeleton } from '../src/components/AppLoadingSkeleton';

/**
 * Root entry: defer tabs redirect when a share deep link is pending so
 * `useShareDeepLink` can navigate to /event or /review first.
 */
export default function Index() {
  const [skipTabsRedirect, setSkipTabsRedirect] = useState<boolean | null>(null);

  useEffect(() => {
    void loadPendingShareLink().then((pending) => {
      setSkipTabsRedirect(pending != null);
    });
  }, []);

  if (skipTabsRedirect === null) {
    return <AppLoadingSkeleton />;
  }

  if (skipTabsRedirect) {
    return null;
  }

  return <Redirect href="/(tabs)" />;
}
