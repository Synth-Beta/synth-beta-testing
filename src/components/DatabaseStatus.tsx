import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface DatabaseStatusProps {
  currentUserId: string;
}

export const DatabaseStatus = ({ currentUserId }: DatabaseStatusProps) => {
  const [profileData, setProfileData] = useState<any>(null);
  const [tableInfo, setTableInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const checkDatabaseStatus = async () => {
    setLoading(true);
    try {
      // Get current profile data
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', currentUserId)
        .single();

      if (profileError) {
        console.error('Profile error:', profileError);
      }

      setProfileData(profile);

      // Try to get table structure by selecting from information_schema
      const { data: columns, error: columnsError } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable')
        .eq('table_name', 'profiles')
        .eq('table_schema', 'public');

      if (columnsError) {
        console.error('Columns error:', columnsError);
      }

      setTableInfo(columns);

    } catch (error) {
      console.error('Database status check error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkDatabaseStatus();
  }, [currentUserId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Database Status
            <Button onClick={checkDatabaseStatus} disabled={loading} size="sm">
              {loading ? 'Checking...' : 'Refresh'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Profile Data */}
          <div>
            <h4 className="font-semibold mb-2">Current Profile Data:</h4>
            <pre className="bg-muted p-3 rounded text-xs overflow-auto">
              {JSON.stringify(profileData, null, 2)}
            </pre>
          </div>

          {/* Table Structure */}
          <div>
            <h4 className="font-semibold mb-2">Profiles Table Structure:</h4>
            {tableInfo ? (
              <div className="space-y-1">
                {tableInfo.map((column: any) => (
                  <div key={column.column_name} className="flex items-center gap-2 text-sm">
                    <Badge variant="outline">{column.column_name}</Badge>
                    <span className="text-muted-foreground">{column.data_type}</span>
                    <span className="text-muted-foreground">
                      {column.is_nullable === 'YES' ? '(nullable)' : '(required)'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">Could not fetch table structure</p>
            )}
          </div>

          {/* Migration Status */}
          <div>
            <h4 className="font-semibold mb-2">Migration Status:</h4>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={profileData?.instagram_handle !== undefined ? "default" : "destructive"}>
                  Instagram Handle
                </Badge>
                {profileData?.instagram_handle !== undefined ? '✅' : '❌'}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={profileData?.music_streaming_profile !== undefined ? "default" : "destructive"}>
                  Music Streaming Profile
                </Badge>
                {profileData?.music_streaming_profile !== undefined ? '✅' : '❌'}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={profileData?.snapchat_handle === undefined ? "default" : "destructive"}>
                  Snapchat Handle (should be removed)
                </Badge>
                {profileData?.snapchat_handle === undefined ? '✅' : '❌'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
