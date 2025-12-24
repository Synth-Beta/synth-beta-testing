import React, { useState, useEffect } from 'react';
import { HorizontalCarousel } from './HorizontalCarousel';
import { SceneCard } from './SceneCard';
import { SceneService, type Scene } from '@/services/sceneService';
import { SceneDetailView } from './SceneDetailView';
import { Loader2 } from 'lucide-react';

interface ScenesSectionProps {
  currentUserId: string;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

export const ScenesSection: React.FC<ScenesSectionProps> = ({
  currentUserId,
  onNavigateToProfile,
  onNavigateToChat,
}) => {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);

  useEffect(() => {
    loadScenes();
  }, [currentUserId]);

  const loadScenes = async () => {
    setLoading(true);
    try {
      const scenesFromDb = await SceneService.getScenes(10, currentUserId);
      setScenes(scenesFromDb);
    } catch (error) {
      console.error('Error loading scenes:', error);
      setScenes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSceneClick = (sceneId: string) => {
    setSelectedSceneId(sceneId);
  };

  const handleBack = () => {
    setSelectedSceneId(null);
  };

  if (selectedSceneId) {
    return (
      <SceneDetailView
        sceneId={selectedSceneId}
        userId={currentUserId}
        onBack={handleBack}
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToChat={onNavigateToChat}
      />
    );
  }

  if (scenes.length === 0 && !loading) {
    return null;
  }

  return (
    <HorizontalCarousel
      title="Scenes & Signals"
      description="Music scenes defined by genre overlap, venue clusters, and co-attendance patterns"
      items={scenes.map((scene) => (
        <SceneCard
          key={scene.id}
          scene={scene}
          onClick={() => handleSceneClick(scene.id)}
        />
      ))}
      loading={loading}
      emptyMessage="No scenes found"
      itemClassName="w-[320px]"
    />
  );
};

