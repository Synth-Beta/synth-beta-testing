import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { PhaseStatus } from '@/services/networkAnalyticsService';

interface PhaseProgressCardProps {
  phaseStatus: PhaseStatus;
}

export function PhaseProgressCard({ phaseStatus }: PhaseProgressCardProps) {
  const getPhaseLabel = (phase: number) => {
    switch (phase) {
      case 0:
        return 'Phase 0: DC (Launch Market)';
      case 1:
        return 'Phase 1: NYC + Boston';
      case 2:
        return 'Phase 2: SF + LA';
      case 3:
        return 'Phase 3: Regional Diversification';
      case 4:
        return 'Phase 4: National/International';
      default:
        return `Phase ${phase}`;
    }
  };

  const avgProgress = phaseStatus.cities.length > 0
    ? phaseStatus.cities.reduce((sum, c) => sum + c.percentComplete, 0) / phaseStatus.cities.length
    : 0;

  return (
    <Card className={phaseStatus.readyToLaunchNext ? 'border-green-500 border-2' : ''}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            {getPhaseLabel(phaseStatus.phaseNumber)}
          </CardTitle>
          <Badge 
            variant={phaseStatus.readyToLaunchNext ? "default" : "secondary"}
            className={phaseStatus.readyToLaunchNext ? "bg-green-500" : ""}
          >
            {phaseStatus.readyToLaunchNext ? 'Ready to Launch Next' : 'In Progress'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Average Progress</span>
            <span className="font-semibold text-gray-900">
              {avgProgress.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full ${
                avgProgress >= 80 ? 'bg-green-500' :
                avgProgress >= 50 ? 'bg-yellow-500' :
                'bg-red-500'
              }`}
              style={{ width: `${Math.min(avgProgress, 100)}%` }}
            />
          </div>
        </div>

        {/* Cities Progress */}
        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-900">City Progress</div>
          {phaseStatus.cities.map(city => (
            <div key={city.city} className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{city.city}</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-600">
                  {city.userCount.toLocaleString()}/{city.targetMAU.toLocaleString()} users
                </span>
                <span className="text-xs text-gray-400">
                  ({city.currentMAU} MAU)
                </span>
                <Badge 
                  variant="outline"
                  className={
                    city.status === 'sustainable' ? 'border-green-500 text-green-700' :
                    city.status === 'near_critical' ? 'border-blue-500 text-blue-700' :
                    city.status === 'building' ? 'border-yellow-500 text-yellow-700' :
                    'border-red-500 text-red-700'
                  }
                >
                  {city.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>

        {/* Launch Criteria */}
        <div className="pt-4 border-t space-y-2">
          <div className="text-sm font-semibold text-gray-900">Launch Criteria</div>
          <div className="space-y-1">
            {phaseStatus.cities.every(c => c.percentComplete >= 60) ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span>All cities at 60%+ of target MAU</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <XCircle className="w-4 h-4" />
                <span>All cities need 60%+ of target MAU</span>
              </div>
            )}
            
            {phaseStatus.cities.every(c => c.week2Retention >= 60) ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                <span>All cities with 60%+ week 2 retention</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <XCircle className="w-4 h-4" />
                <span>All cities need 60%+ week 2 retention</span>
              </div>
            )}
          </div>
        </div>

        {/* Blocking Issues */}
        {phaseStatus.blockingIssues.length > 0 && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 text-sm font-semibold text-orange-600 mb-2">
              <AlertCircle className="w-4 h-4" />
              Blocking Issues
            </div>
            <ul className="space-y-1 text-xs text-gray-600">
              {phaseStatus.blockingIssues.slice(0, 3).map((issue, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-orange-500">•</span>
                  <span>{issue}</span>
                </li>
              ))}
              {phaseStatus.blockingIssues.length > 3 && (
                <li className="text-gray-400 italic">
                  +{phaseStatus.blockingIssues.length - 3} more issues
                </li>
              )}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

