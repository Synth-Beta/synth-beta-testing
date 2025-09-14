import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface SupabaseDebuggerProps {
  currentUserId: string;
}

export const SupabaseDebugger = ({ currentUserId }: SupabaseDebuggerProps) => {
  const [connectionStatus, setConnectionStatus] = useState<string>('Testing...');
  const [authStatus, setAuthStatus] = useState<string>('Testing...');
  const [profilesCount, setProfilesCount] = useState<number>(0);
  const [tableStructure, setTableStructure] = useState<any[]>([]);
  const [testResults, setTestResults] = useState<any>(null);
  const [testProfile, setTestProfile] = useState({
    name: 'Test User ' + Date.now(),
    bio: 'This is a test profile for debugging',
    instagram_handle: 'testuser',
    music_streaming_profile: 'https://open.spotify.com/user/test'
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    runDiagnostics();
  }, [currentUserId]);

  const runDiagnostics = async () => {
    console.log('🔍 Running Supabase diagnostics...');
    
    try {
      // Test 1: Connection
      setConnectionStatus('Testing connection...');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        setConnectionStatus(`❌ Connection error: ${authError.message}`);
        setAuthStatus(`❌ Auth error: ${authError.message}`);
        return;
      }
      
      setConnectionStatus('✅ Connected successfully');
      setAuthStatus(user ? `✅ Authenticated as: ${user.email}` : '⚠️ Not authenticated');

      // Test 2: Profiles table
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .limit(10);

      if (profilesError) {
        console.error('Profiles error:', profilesError);
        setProfilesCount(-1);
      } else {
        setProfilesCount(profiles?.length || 0);
        console.log('Found profiles:', profiles);
      }

      // Test 3: Table structure
      const { data: columns, error: columnsError } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable')
        .eq('table_name', 'profiles')
        .eq('table_schema', 'public');

      if (columnsError) {
        console.error('Columns error:', columnsError);
      } else {
        setTableStructure(columns || []);
        console.log('Table structure:', columns);
      }

    } catch (error) {
      console.error('Diagnostics error:', error);
      setConnectionStatus(`❌ Error: ${error}`);
    }
  };

  const testProfileCreation = async () => {
    setLoading(true);
    try {
      console.log('🧪 Testing profile creation...');
      
      const { data: newProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          user_id: currentUserId,
          ...testProfile
        })
        .select()
        .single();

      if (createError) {
        console.error('Profile creation error:', createError);
        setTestResults({
          success: false,
          error: createError.message,
          code: createError.code,
          details: createError.details
        });
        toast({
          title: "Test Failed",
          description: `Profile creation failed: ${createError.message}`,
          variant: "destructive",
        });
      } else {
        console.log('Profile created successfully:', newProfile);
        setTestResults({
          success: true,
          profile: newProfile
        });
        toast({
          title: "Test Successful",
          description: "Profile created successfully!",
        });

        // Clean up test profile
        await supabase.from('profiles').delete().eq('id', newProfile.id);
        console.log('Test profile cleaned up');
      }
    } catch (error) {
      console.error('Test error:', error);
      setTestResults({
        success: false,
        error: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const testProfileUpdate = async () => {
    setLoading(true);
    try {
      console.log('🧪 Testing profile update...');
      
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          bio: 'Updated bio for testing',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', currentUserId);

      if (updateError) {
        console.error('Profile update error:', updateError);
        setTestResults({
          success: false,
          error: updateError.message,
          code: updateError.code,
          details: updateError.details
        });
        toast({
          title: "Update Test Failed",
          description: `Profile update failed: ${updateError.message}`,
          variant: "destructive",
        });
      } else {
        console.log('Profile updated successfully');
        setTestResults({
          success: true,
          message: 'Profile updated successfully'
        });
        toast({
          title: "Update Test Successful",
          description: "Profile update worked!",
        });
      }
    } catch (error) {
      console.error('Update test error:', error);
      setTestResults({
        success: false,
        error: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Supabase Connection Debug
            <Button onClick={runDiagnostics} size="sm">
              Refresh
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Status */}
          <div>
            <h4 className="font-semibold mb-2">Connection Status:</h4>
            <p className="text-sm">{connectionStatus}</p>
          </div>

          {/* Auth Status */}
          <div>
            <h4 className="font-semibold mb-2">Authentication:</h4>
            <p className="text-sm">{authStatus}</p>
          </div>

          {/* Profiles Count */}
          <div>
            <h4 className="font-semibold mb-2">Profiles in Database:</h4>
            <p className="text-sm">
              {profilesCount === -1 ? '❌ Error accessing profiles table' : `✅ Found ${profilesCount} profiles`}
            </p>
          </div>

          {/* Table Structure */}
          <div>
            <h4 className="font-semibold mb-2">Profiles Table Structure:</h4>
            {tableStructure.length > 0 ? (
              <div className="space-y-1">
                {tableStructure.map((column) => (
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
              <p className="text-sm text-muted-foreground">Could not fetch table structure</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Test Profile Creation */}
      <Card>
        <CardHeader>
          <CardTitle>Test Profile Operations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="test-name">Test Name</Label>
              <Input
                id="test-name"
                value={testProfile.name}
                onChange={(e) => setTestProfile({...testProfile, name: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="test-bio">Test Bio</Label>
              <Input
                id="test-bio"
                value={testProfile.bio}
                onChange={(e) => setTestProfile({...testProfile, bio: e.target.value})}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={testProfileCreation} disabled={loading}>
              {loading ? 'Testing...' : 'Test Profile Creation'}
            </Button>
            <Button onClick={testProfileUpdate} disabled={loading} variant="outline">
              {loading ? 'Testing...' : 'Test Profile Update'}
            </Button>
          </div>

          {/* Test Results */}
          {testResults && (
            <div>
              <h4 className="font-semibold mb-2">Test Results:</h4>
              <pre className="bg-muted p-3 rounded text-xs overflow-auto">
                {JSON.stringify(testResults, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
