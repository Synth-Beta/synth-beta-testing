import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArtistProfile } from './ArtistProfile';
import { ArtistSearchWithProfile } from './ArtistSearchWithProfile';
import { Music, Calendar, Star, Heart } from 'lucide-react';
import type { Artist } from '@/types/concertSearch';

interface ArtistProfileDemoProps {
  userId?: string;
  className?: string;
}

export function ArtistProfileDemo({ userId, className }: ArtistProfileDemoProps) {

  return (
    <div className={`w-full max-w-4xl mx-auto p-6 ${className}`}>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-4">Artist Profile Demo</h1>
        <p className="text-muted-foreground mb-6">
          Search for an artist to view their profile and events
        </p>
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="w-5 h-5" />
            Search for an Artist
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ArtistSearchWithProfile userId={userId} />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="w-5 h-5" />
              Upcoming Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              View and express interest in upcoming concerts and festivals
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Heart className="w-4 h-4 text-red-500" />
                <span>Mark events you're interested in</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span>See event details and ticket info</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Star className="w-5 h-5" />
              Past Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Review past concerts and share your experience
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Star className="w-4 h-4 text-yellow-500" />
                <span>Rate events you attended</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Music className="w-4 h-4 text-purple-500" />
                <span>Write reviews and share memories</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Music className="w-5 h-5" />
              Artist Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Learn about artists and their musical journey
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">Genres</Badge>
                <span>Explore musical styles</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline">Bio</Badge>
                <span>Read artist descriptions</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-900 mb-2">How it works:</h3>
        <ol className="text-sm text-blue-800 space-y-1">
          <li>1. Search for an artist using the search box above</li>
          <li>2. Click on an artist to view their full profile</li>
          <li>3. Browse their upcoming and past events</li>
          <li>4. Express interest in upcoming events or review past ones</li>
          <li>5. Your interests and reviews are saved to your profile</li>
        </ol>
      </div>
    </div>
  );
}
