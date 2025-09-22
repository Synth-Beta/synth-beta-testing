import React from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Star, 
  Globe, 
  Users, 
  Lock, 
  Check, 
  Eye,
  EyeOff,
  Info
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewFormData } from '@/hooks/useReviewForm';

interface PrivacySubmitStepProps {
  formData: ReviewFormData;
  errors: Record<string, string>;
  onUpdateFormData: (updates: Partial<ReviewFormData>) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function PrivacySubmitStep({ 
  formData, 
  errors, 
  onUpdateFormData, 
  onSubmit, 
  isLoading 
}: PrivacySubmitStepProps) {
  const handlePrivacyChange = (isPublic: boolean) => {
    onUpdateFormData({ isPublic });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getRatingStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => {
      const starValue = i + 1;
      const isFullStar = rating >= starValue;
      const isHalfStar = rating >= i + 0.5 && rating < starValue;
      
      return (
        <div key={i} className="relative">
          <Star
            className={cn(
              "w-4 h-4",
              isFullStar ? "text-yellow-400 fill-current" : "text-gray-300"
            )}
          />
          {isHalfStar && (
            <div className="absolute inset-0 overflow-hidden w-1/2">
              <Star className="w-4 h-4 text-yellow-400 fill-current" />
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Privacy & Submit</h2>
        <p className="text-sm text-gray-600">Choose who can see your review</p>
      </div>

      {/* Review Summary */}
      <Card className="border-gray-200">
        <CardContent className="p-4">
          <h3 className="font-medium text-gray-900 mb-3">Review Summary</h3>
          <div className="space-y-3">
            {/* Event Info */}
            <div className="flex items-center space-x-2">
              <Check className="w-4 h-4 text-green-500" />
              <span className="text-sm text-gray-700">
                <strong>{formData.selectedArtist?.name}</strong> at <strong>{formData.selectedVenue?.name}</strong>
              </span>
            </div>
            
            <div className="flex items-center space-x-2">
              <Check className="w-4 h-4 text-green-500" />
              <span className="text-sm text-gray-700">{formatDate(formData.eventDate)}</span>
            </div>
            
            {/* Rating */}
            <div className="flex items-center space-x-2">
              <Check className="w-4 h-4 text-green-500" />
              <div className="flex items-center space-x-1">
                {getRatingStars(formData.rating)}
                <span className="text-sm text-gray-700 ml-1">({formData.rating}/5)</span>
              </div>
            </div>
            
            {/* Content */}
            {formData.reactionEmoji && (
              <div className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-500" />
                <span className="text-sm text-gray-700">
                  Reaction: {formData.reactionEmoji}
                </span>
              </div>
            )}
            
            {formData.reviewText && (
              <div className="flex items-center space-x-2">
                <Check className="w-4 h-4 text-green-500" />
                <span className="text-sm text-gray-700">
                  Written review ({formData.reviewText.length} characters)
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Privacy Settings */}
      <div className="space-y-4">
        <Label className="text-sm font-medium">Who can see this review?</Label>
        
        <div className="space-y-3">
          {/* Public Option */}
          <div className="relative">
            <input
              type="radio"
              id="public"
              name="privacy"
              checked={formData.isPublic}
              onChange={() => handlePrivacyChange(true)}
              className="sr-only"
            />
            <label
              htmlFor="public"
              className={cn(
                "flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all duration-200",
                formData.isPublic 
                  ? "border-blue-500 bg-blue-50" 
                  : "border-gray-200 hover:border-gray-300"
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                formData.isPublic ? "border-blue-500 bg-blue-500" : "border-gray-300"
              )}>
                {formData.isPublic && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <Globe className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-gray-900">Public</span>
                  <Badge variant="secondary" className="text-xs">Recommended</Badge>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Everyone can see your review. Help others discover great concerts!
                </p>
              </div>
            </label>
          </div>

          {/* Private Option */}
          <div className="relative">
            <input
              type="radio"
              id="private"
              name="privacy"
              checked={!formData.isPublic}
              onChange={() => handlePrivacyChange(false)}
              className="sr-only"
            />
            <label
              htmlFor="private"
              className={cn(
                "flex items-center space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-all duration-200",
                !formData.isPublic 
                  ? "border-blue-500 bg-blue-50" 
                  : "border-gray-200 hover:border-gray-300"
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                !formData.isPublic ? "border-blue-500 bg-blue-500" : "border-gray-300"
              )}>
                {!formData.isPublic && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <Lock className="w-5 h-5 text-gray-600" />
                  <span className="font-medium text-gray-900">Private</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Only you can see this review. You can change this later.
                </p>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Privacy Info */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-start space-x-2">
          <Info className="w-4 h-4 text-gray-600 mt-0.5" />
          <div className="text-sm text-gray-600">
            <p className="font-medium mb-1">About privacy:</p>
            <ul className="space-y-1 text-xs">
              <li>• Public reviews help the community discover great concerts</li>
              <li>• You can always change the privacy setting later</li>
              <li>• Private reviews are only visible to you</li>
              <li>• All reviews are moderated for appropriate content</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="pt-6 pb-4">
        <Button
          onClick={onSubmit}
          disabled={isLoading}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white py-3 text-base font-medium"
        >
          {isLoading ? (
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Submitting Review...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Check className="w-5 h-5" />
              <span>Submit Review</span>
            </div>
          )}
        </Button>
        
        {errors.submit && (
          <p className="text-sm text-red-600 text-center mt-2">{errors.submit}</p>
        )}
      </div>

      {/* Final Note */}
      <div className="text-center">
        <p className="text-xs text-gray-500">
          By submitting, you agree to our terms of service and community guidelines.
        </p>
      </div>
    </div>
  );
}
