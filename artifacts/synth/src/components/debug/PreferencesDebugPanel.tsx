import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { PreferencesDebugService, type PreferenceDebugSnapshot } from '@/services/preferencesDebugService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Button } from '@/components/ui/button';

interface PreferencesDebugPanelProps {
  className?: string;
}

/**
 * Dev / partner-only panel that surfaces:
 * - How many preference signals exist for the current user (by type)
 * - Whether an aggregated user_preferences row exists
 * - Whether PersonalizedFeedService.userHasMusicData() returns true
 *
 * This component is intentionally simple and should be mounted only in
 * internal/dev screens, not in the main consumer UI.
 */
export const PreferencesDebugPanel: React.FC<PreferencesDebugPanelProps> = ({ className }) => {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<PreferenceDebugSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await PreferencesDebugService.getSnapshotForUser(user.id);
      setSnapshot(data);
    } catch (err) {
      console.error('PreferencesDebugPanel: error loading snapshot:', err);
      setError('Failed to load preference debug data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user?.id) {
    return null;
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">
          Preference Debug
        </CardTitle>
        <Button size="xs" variant="outline" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {error && <p className="text-destructive">{error}</p>}

        {!snapshot && !loading && !error && (
          <p className="text-muted-foreground">No data yet.</p>
        )}

        {snapshot && (
          <>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Signals</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}> 0 ? 'default' : 'secondary'}>
                  {snapshot.totalSignals} total
                </span>
              </div>
              {snapshot.totalSignals === 0 ? (
                <p className="text-muted-foreground">
                  No rows in <code>user_preference_signals</code> for this user.
                </p>
              ) : (
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  {Object.entries(snapshot.signalsByType).map(([type, count]) => (
                    <li key={type}>
                      <code>{type}</code>: {count}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Aggregated preferences</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
                  {snapshot.userPreferencesRow.hasRow ? 'row present' : 'no row'}
                </span>
              </div>
              {snapshot.userPreferencesRow.hasRow ? (
                <>
                  <p className="text-muted-foreground">
                    last_signal_at:{' '}
                    {snapshot.userPreferencesRow.last_signal_at || '—'} · signal_count:{' '}
                    {snapshot.userPreferencesRow.signal_count ?? '—'}
                  </p>
                  <p className="text-muted-foreground">
                    top_genres:{' '}
                    {snapshot.userPreferencesRow.top_genres && snapshot.userPreferencesRow.top_genres.length > 0
                      ? snapshot.userPreferencesRow.top_genres.join(', ')
                      : '—'}
                  </p>
                  <p className="text-muted-foreground">
                    top_artists (UUIDs):{' '}
                    {snapshot.userPreferencesRow.top_artists && snapshot.userPreferencesRow.top_artists.length > 0
                      ? snapshot.userPreferencesRow.top_artists.join(', ')
                      : '—'}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  No <code>user_preferences</code> row yet for this user. Either no signals exist or
                  <code>refresh_user_preferences_v5</code> has not been run.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <span className="font-semibold">Engine view</span>
              <p className="text-muted-foreground">
                <code>userHasMusicData()</code> =&nbsp;
                {snapshot.hasMusicDataFlag ? 'true' : 'false'}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

