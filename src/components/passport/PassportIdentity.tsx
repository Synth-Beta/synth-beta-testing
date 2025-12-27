import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Music, MapPin, Calendar, Sparkles } from 'lucide-react';
import { PassportIdentityService, type PassportIdentity } from '@/services/passportIdentityService';
import { Skeleton } from '@/components/ui/skeleton';

interface PassportIdentityProps {
  userId: string;
  userName?: string;
}

export const PassportIdentity: React.FC<PassportIdentityProps> = ({ userId, userName }) => {
  const [identity, setIdentity] = useState<PassportIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadIdentity();
  }, [userId]);

  const loadIdentity = async () => {
    setLoading(true);
    try {
      let identityData = await PassportIdentityService.getIdentity(userId);
      
      // If no identity exists, calculate it
      if (!identityData) {
        await PassportIdentityService.calculateIdentity(userId);
        identityData = await PassportIdentityService.getIdentity(userId);
      }

      setIdentity(identityData);
    } catch (error) {
      console.error('Error loading passport identity:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!identity) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <p>Identity calculation in progress...</p>
        </CardContent>
      </Card>
    );
  }

  const fanTypeDisplay = PassportIdentityService.getFanTypeDisplay(identity.fan_type);

  return (
    <div className="space-y-4">
      {/* Passport Header */}
      <Card className="border-2 border-synth-pink/20 bg-gradient-to-br from-white to-pink-50/30">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <Music className="w-6 h-6 text-synth-pink" />
            {userName ? `${userName}'s` : 'Your'} Passport
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Fan Type Badge */}
          <div className="flex items-center gap-3">
            <Badge 
              variant="secondary" 
              className="text-base px-4 py-2 bg-synth-pink/10 text-synth-pink border-synth-pink/30"
            >
              {fanTypeDisplay.name}
            </Badge>
            <p className="text-sm text-muted-foreground flex-1">
              {fanTypeDisplay.description}
            </p>
          </div>

          {/* Join Year */}
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">Live since {identity.join_year}</span>
          </div>

          {/* Home Scene */}
          {identity.home_scene && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1">
                <span className="font-medium">Home Scene: </span>
                <span className="text-muted-foreground">{identity.home_scene.name}</span>
                {identity.home_scene.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {identity.home_scene.description}
                  </p>
                )}
              </div>
            </div>
          )}

          {!identity.home_scene && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="w-4 h-4" />
              <span>Home scene being calculated...</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

