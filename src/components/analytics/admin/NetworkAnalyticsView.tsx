import React, { useState, useEffect } from 'react';
import { NetworkAnalyticsService, CityMetrics, PhaseStatus, RetentionCohort, ActivationMetrics, ContentHealthMetrics } from '@/services/networkAnalyticsService';
import { CityStatusCard } from './CityStatusCard';
import { CohortRetentionChart } from './CohortRetentionChart';
import { PhaseProgressCard } from './PhaseProgressCard';
import { getCitiesForPhase, getCurrentPhase } from '@/config/cityTargets';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, Users, TrendingUp, BarChart3, MapPin, Clock } from 'lucide-react';
import { SkeletonCard } from '@/components/analytics/shared/SkeletonCard';

export function NetworkAnalyticsView() {
  const [loading, setLoading] = useState(true);
  const [allCityMetrics, setAllCityMetrics] = useState<CityMetrics[]>([]);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [retentionData, setRetentionData] = useState<RetentionCohort[]>([]);
  const [activationMetrics, setActivationMetrics] = useState<ActivationMetrics | null>(null);
  const [contentHealth, setContentHealth] = useState<ContentHealthMetrics | null>(null);
  const [phaseStatuses, setPhaseStatuses] = useState<Map<number, PhaseStatus>>(new Map());
  const [currentPhase] = useState<number>(getCurrentPhase());

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (selectedCity) {
      loadCityDetails(selectedCity);
    }
  }, [selectedCity]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      
      // Load all city metrics
      const cities = await NetworkAnalyticsService.getAllCitiesSnapshot();
      setAllCityMetrics(cities);
      
      // Set default selected city to first city in current phase
      if (cities.length > 0 && !selectedCity) {
        const currentPhaseCities = cities.filter(c => {
          const cityTarget = getCitiesForPhase(currentPhase).find(ct => ct.city === c.city);
          return cityTarget !== undefined;
        });
        if (currentPhaseCities.length > 0) {
          setSelectedCity(currentPhaseCities[0].city);
        } else {
          setSelectedCity(cities[0].city);
        }
      }

      // Load phase statuses for all phases
      const phases = [0, 1, 2, 3];
      const phaseStatusMap = new Map<number, PhaseStatus>();
      for (const phase of phases) {
        const status = await NetworkAnalyticsService.getPhaseProgress(phase);
        phaseStatusMap.set(phase, status);
      }
      setPhaseStatuses(phaseStatusMap);

    } catch (error) {
      console.error('Error loading network analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCityDetails = async (city: string) => {
    try {
      const [retention, activation, health] = await Promise.all([
        NetworkAnalyticsService.getCityRetentionCurve(city, 8),
        NetworkAnalyticsService.getActivationMetrics(city),
        NetworkAnalyticsService.getContentHealthMetrics(city)
      ]);
      
      setRetentionData(retention);
      setActivationMetrics(activation);
      setContentHealth(health);
    } catch (error) {
      console.error(`Error loading details for ${city}:`, error);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  const currentPhaseCities = allCityMetrics.filter(c => {
    const cityTarget = getCitiesForPhase(currentPhase).find(ct => ct.city === c.city);
    return cityTarget !== undefined;
  });

  const selectedCityMetrics = selectedCity 
    ? allCityMetrics.find(c => c.city === selectedCity) || null
    : null;


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Target className="w-6 h-6 text-synth-pink" />
            Network Effect Analytics
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Track critical mass and network effect metrics across all expansion phases
          </p>
        </div>
      </div>

      {/* Section 1: Executive Scorecard - Current Phase */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Current Phase {currentPhase} - Executive Scorecard
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentPhaseCities.map(city => (
            <CityStatusCard
              key={city.city}
              metrics={city}
              onClick={() => setSelectedCity(city.city)}
            />
          ))}
          {currentPhaseCities.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center text-gray-500">
                <p>No cities in current phase yet</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Section 2: All Phases Overview */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900">All Phases Overview</h3>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map(phase => {
            const status = phaseStatuses.get(phase);
            if (!status) return null;
            return (
              <PhaseProgressCard key={phase} phaseStatus={status} />
            );
          })}
        </div>
      </div>

      {/* Section 3: Deep Dive Metrics */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Deep Dive Metrics</h3>
          </div>
          <Select value={selectedCity || ''} onValueChange={setSelectedCity}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select a city" />
            </SelectTrigger>
            <SelectContent>
              {allCityMetrics.map(city => (
                <SelectItem key={city.city} value={city.city}>
                  {city.city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedCityMetrics && (
          <div className="space-y-4">
            {/* Cohort Retention Chart */}
            <CohortRetentionChart data={retentionData} city={selectedCity} />

            {/* Activation & Content Health Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Activation Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    Activation Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activationMetrics && activationMetrics.totalUsers > 0 ? (
                    <>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                          <div className="text-2xl font-bold text-blue-900">
                            {activationMetrics.avgDaysTo3Friends.toFixed(0)}
                          </div>
                          <div className="text-xs text-blue-700">Days to 3 Friends</div>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                          <div className="text-2xl font-bold text-green-900">
                            {activationMetrics.avgDaysTo5Friends.toFixed(0)}
                          </div>
                          <div className="text-xs text-green-700">Days to 5 Friends</div>
                        </div>
                        <div className="text-center p-3 bg-purple-50 rounded-lg">
                          <div className="text-2xl font-bold text-purple-900">
                            {activationMetrics.avgDaysTo7Friends.toFixed(0)}
                          </div>
                          <div className="text-xs text-purple-700">Days to 7 Friends</div>
                        </div>
                      </div>
                      <div className="pt-4 border-t space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Users with 3+ friends:</span>
                          <span className="font-semibold">
                            {activationMetrics.usersWith3PlusFriends} ({((activationMetrics.usersWith3PlusFriends / activationMetrics.totalUsers) * 100).toFixed(1)}%)
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Users with 5+ friends:</span>
                          <span className="font-semibold">
                            {activationMetrics.usersWith5PlusFriends} ({((activationMetrics.usersWith5PlusFriends / activationMetrics.totalUsers) * 100).toFixed(1)}%)
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Users with 7+ friends:</span>
                          <span className="font-semibold">
                            {activationMetrics.usersWith7PlusFriends} ({((activationMetrics.usersWith7PlusFriends / activationMetrics.totalUsers) * 100).toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>No activation data available</p>
                      <p className="text-xs text-gray-400 mt-1">Need more users in this city</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Content Health Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-purple-600" />
                    Content Health
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {contentHealth && contentHealth.totalEvents > 0 ? (
                    <>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Events with 0 rankings:</span>
                          <span className="font-semibold">{contentHealth.eventsWith0Rankings}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Events with 1-2 rankings:</span>
                          <span className="font-semibold">{contentHealth.eventsWith1to2Rankings}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Events with 3-5 rankings:</span>
                          <span className="font-semibold text-green-600">{contentHealth.eventsWith3to5Rankings}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Events with 6+ rankings:</span>
                          <span className="font-semibold text-green-600">{contentHealth.eventsWith6PlusRankings}</span>
                        </div>
                      </div>
                      <div className="pt-4 border-t">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-purple-600">
                            {contentHealth.coverageScore.toFixed(1)}%
                          </div>
                          <div className="text-sm text-gray-600">Event Coverage Score</div>
                          <p className="text-xs text-gray-400 mt-1">
                            {contentHealth.totalEvents} total events
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>No content data available</p>
                      <p className="text-xs text-gray-400 mt-1">No events found for this city</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {!selectedCityMetrics && (
          <Card>
            <CardContent className="p-6 text-center text-gray-500">
              <p>Select a city to view detailed metrics</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Section 4: All Cities Summary Table */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">All Cities Summary</h3>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">City</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Phase</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">MAU</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">% Complete</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">WoW Growth</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">W2 Retention</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Network %</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {allCityMetrics.map(city => {
                    const cityTarget = getCitiesForPhase(
                      [0, 1, 2, 3].find(p => 
                        getCitiesForPhase(p).some(ct => ct.city === city.city)
                      ) || 0
                    ).find(ct => ct.city === city.city);
                    const phase = cityTarget?.phase || 0;

                    return (
                      <tr 
                        key={city.city} 
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedCity(city.city)}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{city.city}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">Phase {phase}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {city.currentMAU.toLocaleString()} / {city.targetMAU.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{city.percentComplete.toFixed(1)}%</td>
                        <td className={`px-4 py-3 text-sm font-medium ${
                          city.wowGrowth > 0 ? 'text-green-600' : 
                          city.wowGrowth < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {city.wowGrowth > 0 ? '+' : ''}{city.wowGrowth.toFixed(1)}%
                        </td>
                        <td className={`px-4 py-3 text-sm ${
                          city.week2Retention >= 60 ? 'text-green-600' :
                          city.week2Retention >= 40 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {city.week2Retention.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{city.networkCompleteness.toFixed(0)}%</td>
                        <td className="px-4 py-3">
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

