import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, Calendar } from 'lucide-react';
import { ArtistSearchBox } from '@/components/ArtistSearchBox';
import { VenueSearchBox } from '@/components/VenueSearchBox';
import type { Artist } from '@/types/concertSearch';
import type { VenueSearchResult } from '@/services/unifiedVenueSearchService';
import type { ReviewFormData } from '@/hooks/useReviewForm';

interface EventDetailsStepProps {
  formData: ReviewFormData;
  errors: Record<string, string>;
  onUpdateFormData: (updates: Partial<ReviewFormData>) => void;
}

export function EventDetailsStep({ formData, errors, onUpdateFormData }: EventDetailsStepProps) {
  const handleArtistSelect = (artist: Artist) => {
    onUpdateFormData({ selectedArtist: artist });
  };

  const handleVenueSelect = (venue: VenueSearchResult) => {
    console.log('🎯 Venue selected:', venue);
    onUpdateFormData({ selectedVenue: venue });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateFormData({ eventDate: e.target.value });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Event Details</h2>
        <p className="text-sm text-gray-600">Tell us about the concert you attended</p>
      </div>

      {/* Artist Selection */}
      <div className="space-y-3">
        <Label htmlFor="artist" className="text-sm font-medium">
          Artist or Band *
        </Label>
        <ArtistSearchBox
          onArtistSelect={handleArtistSelect}
          placeholder="Search for an artist or band..."
          className="w-full"
        />
        {errors.selectedArtist && (
          <p className="text-sm text-red-600">{errors.selectedArtist}</p>
        )}
        {formData.selectedArtist && (
          <div className="flex items-center space-x-2 p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800">
                {formData.selectedArtist.name}
              </p>
              {formData.selectedArtist.genres && formData.selectedArtist.genres.length > 0 && (
                <p className="text-xs text-green-600">
                  {formData.selectedArtist.genres.join(', ')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Venue Selection */}
      <div className="space-y-3">
        <Label htmlFor="venue" className="text-sm font-medium">
          Venue *
        </Label>
        <VenueSearchBox
          onVenueSelect={handleVenueSelect}
          placeholder="Search for a venue..."
          className="w-full"
        />
        {errors.selectedVenue && (
          <p className="text-sm text-red-600">{errors.selectedVenue}</p>
        )}
        {formData.selectedVenue && (
          <div className="flex items-center space-x-2 p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800">
                {formData.selectedVenue.name}
              </p>
              {formData.selectedVenue.address && (
                <p className="text-xs text-green-600">
                  {[
                    formData.selectedVenue.address.addressLocality,
                    formData.selectedVenue.address.addressRegion
                  ].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Date Selection */}
      <div className="space-y-3">
        <Label htmlFor="eventDate" className="text-sm font-medium flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Concert Date *
        </Label>
        <Input
          id="eventDate"
          type="date"
          value={formData.eventDate}
          onChange={handleDateChange}
          className="w-full"
          max={new Date().toISOString().split('T')[0]} // Can't be in the future
        />
        {errors.eventDate && (
          <p className="text-sm text-red-600">{errors.eventDate}</p>
        )}
        {formData.eventDate && (
          <div className="flex items-center space-x-2 p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <p className="text-sm font-medium text-green-800">
              {new Date(formData.eventDate).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
          </div>
        )}
      </div>

      {/* Summary */}
      {formData.selectedArtist && formData.selectedVenue && formData.eventDate && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="text-sm font-medium text-blue-900 mb-2">Event Summary</h3>
          <div className="text-sm text-blue-800">
            <p><strong>{formData.selectedArtist.name}</strong></p>
            <p>at <strong>{formData.selectedVenue.name}</strong></p>
            <p>on {new Date(formData.eventDate).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}</p>
          </div>
        </div>
      )}
    </div>
  );
}