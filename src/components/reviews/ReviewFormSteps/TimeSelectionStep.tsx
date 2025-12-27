import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TimeSelectionStepProps {
  reviewDuration: '1min' | '3min' | '5min' | null;
  onSelectDuration: (duration: '1min' | '3min' | '5min') => void;
}

export function TimeSelectionStep({ reviewDuration, onSelectDuration }: TimeSelectionStepProps) {
  const options = [
    {
      value: '1min' as const,
      label: '1 Minute',
      subtitle: 'Quick Review',
      description: 'Overall rating + brief text',
      features: ['Overall rating', 'Brief review text (200 chars)', 'Optional setlist'],
    },
    {
      value: '3min' as const,
      label: '3 Minutes',
      subtitle: 'Standard Review',
      description: 'Key ratings + text + photos',
      features: ['Overall rating', 'Artist Performance & Venue ratings', 'Review text (400 chars)', 'Optional photos', 'Optional setlist'],
    },
    {
      value: '5min' as const,
      label: '5 Minutes',
      subtitle: 'Detailed Review',
      description: 'Full detailed review',
      features: ['All 5 category ratings', 'Category feedback', 'Full review text (500 chars)', 'Photos & videos', 'Optional setlist', 'Optional ticket price'],
    },
  ];

  return (
    <div className="space-y-8">
      <header className="text-center space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-pink-500 font-semibold">Get Started</p>
        <h2 className="text-2xl font-semibold text-gray-900">How much time do you want to spend?</h2>
        <p className="text-sm text-gray-600 max-w-xl mx-auto">
          Choose the review style that works best for you.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {options.map((option) => {
          const isSelected = reviewDuration === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelectDuration(option.value)}
              className={cn(
                'relative p-6 rounded-2xl border-2 text-left transition-all',
                'hover:shadow-lg hover:scale-[1.02]',
                isSelected
                  ? 'border-pink-500 bg-gradient-to-br from-pink-50 to-rose-50 shadow-md'
                  : 'border-gray-200 bg-white hover:border-pink-300'
              )}
            >
              <div className="flex items-center gap-3 mb-3">
                <Clock className={cn('w-5 h-5', isSelected ? 'text-pink-600' : 'text-gray-400')} />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{option.label}</h3>
                  <p className="text-sm text-gray-500">{option.subtitle}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 mb-4">{option.description}</p>
              <ul className="space-y-1.5">
                {option.features.map((feature, idx) => (
                  <li key={idx} className="text-xs text-gray-500 flex items-start gap-2">
                    <span className="text-pink-500 mt-0.5">•</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {isSelected && (
                <div className="absolute top-4 right-4">
                  <div className="w-6 h-6 rounded-full bg-pink-500 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

