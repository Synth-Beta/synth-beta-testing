import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Calendar, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { User } from '@/types/database';

export function AgeVerificationCard() {
  const { user: authUser } = useAuth();
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [age, setAge] = useState<number | null>(null);

  useEffect(() => {
    if (!authUser?.id) {
      setLoading(false);
      return;
    }

    const fetchUserData = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('birthday, age_verified, is_minor')
          .eq('user_id', authUser.id)
          .single();

        if (error) {
          console.error('Error fetching user data:', error);
          setLoading(false);
          return;
        }

        setUserData(data as User);

        // Calculate age from birthday
        if (data?.birthday) {
          const birthDate = new Date(data.birthday);
          const today = new Date();
          let calculatedAge = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            calculatedAge--;
          }
          
          setAge(calculatedAge);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error in fetchUserData:', error);
        setLoading(false);
      }
    };

    fetchUserData();
  }, [authUser?.id]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Age Verification</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isVerified = userData?.age_verified ?? false;
  const isMinor = userData?.is_minor ?? false;
  const birthday = userData?.birthday;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <CardTitle>Age Verification</CardTitle>
        </div>
        <CardDescription>
          Your age verification status and account safety settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Verification Status */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-2">
            {isVerified ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <Calendar className="w-5 h-5 text-muted-foreground" />
            )}
            <span className="font-medium">Age Verified</span>
          </div>
          <Badge variant={isVerified ? 'default' : 'outline'}>
            {isVerified ? 'Verified' : 'Not Verified'}
          </Badge>
        </div>

        {/* Age Display */}
        {age !== null && (
          <div className="p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Your Age</span>
              <span className="text-lg font-semibold">{age} years old</span>
            </div>
            {isMinor && (
              <p className="text-xs text-muted-foreground mt-2">
                Parental controls are enabled for accounts under 18
              </p>
            )}
          </div>
        )}

        {/* Birthday Display (read-only) */}
        {birthday && (
          <div className="p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Birthday</span>
              <span className="text-sm text-muted-foreground">
                {new Date(birthday).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Your birthday cannot be changed without verification
            </p>
          </div>
        )}

        {/* Info Message */}
        {!isVerified && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-700">
              Age verification is required to use Synth. Please complete your profile setup to verify your age.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
