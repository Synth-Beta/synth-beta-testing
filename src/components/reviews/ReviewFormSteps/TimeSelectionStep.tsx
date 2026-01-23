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
        <p
          style={{
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-meta-size, 16px)',
            fontWeight: 'var(--typography-meta-weight, 500)',
            lineHeight: 'var(--typography-meta-line-height, 1.5)',
            color: 'var(--brand-pink-500)',
            textTransform: 'uppercase',
            letterSpacing: '0.3em'
          }}
        >
          Get Started
        </p>
        <h2
          style={{
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-h2-size, 24px)',
            fontWeight: 'var(--typography-h2-weight, 700)',
            lineHeight: 'var(--typography-h2-line-height, 1.3)',
            color: 'var(--neutral-900)'
          }}
        >
          How much time do you want to spend?
        </h2>
        <p
          className="max-w-xl mx-auto"
          style={{
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-meta-size, 16px)',
            fontWeight: 'var(--typography-meta-weight, 500)',
            lineHeight: 'var(--typography-meta-line-height, 1.5)',
            color: 'var(--neutral-600)'
          }}
        >
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
                'relative p-6 rounded-2xl border-2 text-left transition-all hover:scale-[1.02]'
              )}
              style={{
                borderColor: isSelected ? 'var(--brand-pink-500)' : 'var(--neutral-200)',
                background: isSelected ? 'var(--brand-pink-050)' : 'var(--neutral-50)',
                boxShadow: isSelected ? '0 4px 4px 0 var(--shadow-color)' : 'none'
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <Clock
                  className="w-5 h-5"
                  style={{ color: isSelected ? 'var(--brand-pink-500)' : 'var(--neutral-900)' }}
                />
                <div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-body-size, 20px)',
                      fontWeight: 'var(--typography-body-weight, 500)',
                      lineHeight: 'var(--typography-body-line-height, 1.5)',
                      color: 'var(--neutral-900)'
                    }}
                  >
                    {option.label}
                  </h3>
                  <p
                    style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      color: 'var(--neutral-600)'
                    }}
                  >
                    {option.subtitle}
                  </p>
                </div>
              </div>
              <p
                className="mb-4"
                style={{
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  color: 'var(--brand-pink-500)'
                }}
              >
                {option.description}
              </p>
              <ul className="space-y-1.5" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {option.features.map((feature, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2"
                    style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      color: 'var(--neutral-600)'
                    }}
                  >
                    <span
                      style={{
                        width: 'var(--spacing-inline, 6px)',
                        height: 'var(--spacing-inline, 6px)',
                        backgroundColor: 'var(--neutral-600)',
                        borderRadius: '999px',
                        display: 'inline-block',
                        marginTop: 'var(--spacing-inline, 6px)',
                        flexShrink: 0
                      }}
                    />
                    <span style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      color: 'var(--neutral-600)'
                    }}>{feature}</span>
                  </li>
                ))}
              </ul>
              {isSelected && (
                <div className="absolute top-4 right-4">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'var(--brand-pink-500)' }}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      style={{ color: 'var(--neutral-50)' }}
                    >
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

