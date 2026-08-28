/**
 * Persistent product scenes SoT (LOI-589).
 * Mobile consumers for persistent product scenes SoT.
 */
import { supabase } from '../integrations/supabase/client';
import {
  SCENE_DC_THIS_WEEK,
  SCENE_DC_GOING_OUT,
  PERSISTENT_PRODUCT_SCENES,
  ROOM1_ACTIVE_MEMBER_TARGET,
  ROOM2_ACTIVE_MEMBER_TARGET,
  fetchPersistentProductScenes,
  fetchProductSceneMemberCounts,
  fetchProductSceneCoPresence,
  joinProductScene,
  type PersistentProductSceneRow,
} from '@synth/shared';

export {
  SCENE_DC_THIS_WEEK,
  SCENE_DC_GOING_OUT,
  PERSISTENT_PRODUCT_SCENES,
  ROOM1_ACTIVE_MEMBER_TARGET,
  ROOM2_ACTIVE_MEMBER_TARGET,
};

export type ProductScene = PersistentProductSceneRow;

export class ProductSceneService {
  static async getScenes(userId?: string | null): Promise<ProductScene[]> {
    try {
      return await fetchPersistentProductScenes(supabase, { userId });
    } catch (err) {
      console.error('[ProductSceneService] getScenes', err);
      return [];
    }
  }

  static async getMemberCounts() {
    try {
      return await fetchProductSceneMemberCounts(supabase);
    } catch (err) {
      console.error('[ProductSceneService] getMemberCounts', err);
      return [];
    }
  }

  static async join(sceneId: string, userId?: string | null): Promise<string | null> {
    const { chatId, error } = await joinProductScene(supabase, sceneId, userId);
    if (error) {
      console.error('[ProductSceneService] join', error);
      return null;
    }
    return chatId;
  }

  static async getRoom1CoPresence(userId?: string | null) {
    try {
      return await fetchProductSceneCoPresence(supabase, {
        sceneId: SCENE_DC_THIS_WEEK,
        userId,
      });
    } catch (err) {
      console.error('[ProductSceneService] getRoom1CoPresence', err);
      return null;
    }
  }

  static async getWarmScenes(userId?: string | null): Promise<ProductScene[]> {
    const scenes = await this.getScenes(userId);
    return scenes.filter((s) => s.passesWarmthGate);
  }
}
