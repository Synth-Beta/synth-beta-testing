import React from 'react';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  steps: string[];
  className?: string;
}

export function StepIndicator({ currentStep, totalSteps, steps, className }: StepIndicatorProps) {
  return (
    <div className={cn("flex items-center justify-center space-x-4", className)}>
      {steps.map((step, index) => {
        const stepNumber = index + 1;
        const isCompleted = stepNumber < currentStep;
        const isCurrent = stepNumber === currentStep;
        
        return (
          <div key={stepNumber} className="flex items-center">
            <div className="flex flex-col items-center">
              {/* Step Circle */}
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200",
                  isCompleted && "bg-green-500 text-white",
                  isCurrent && "bg-blue-500 text-white",
                  !isCompleted && !isCurrent && "bg-gray-200 text-gray-600"
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  stepNumber
                )}
              </div>
              
              {/* Step Label */}
              <span
                className={cn(
                  "text-xs mt-1 text-center transition-colors duration-200",
                  isCurrent && "text-blue-600 font-medium",
                  isCompleted && "text-green-600 font-medium",
                  !isCompleted && !isCurrent && "text-gray-500"
                )}
              >
                {step}
              </span>
            </div>
            
            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "w-12 h-0.5 mx-2 transition-colors duration-200",
                  stepNumber < currentStep ? "bg-green-500" : "bg-gray-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
