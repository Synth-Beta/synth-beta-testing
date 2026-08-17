import { supabase } from '@/integrations/supabase/client';

/** Per-user mute for AI Scene Guides in a room. Publisher must respect immediately. */
export class AiSceneGuideMuteService {
  static async isMuted(userId: string, roomId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('ai_scene_guide_room_prefs')
      .select('mute_ai_guides')
      .eq('user_id', userId)
      .eq('room_id', roomId)
      .maybeSingle();
    if (error) {
      console.warn('[AiSceneGuideMuteService] isMuted', error.message);
      return false;
    }
    return Boolean(data?.mute_ai_guides);
  }

  static async setMuted(userId: string, roomId: string, mute: boolean): Promise<void> {
    const { error } = await supabase.from('ai_scene_guide_room_prefs').upsert(
      {
        user_id: userId,
        room_id: roomId,
        mute_ai_guides: mute,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,room_id' },
    );
    if (error) {
      console.error('[AiSceneGuideMuteService] setMuted', error.message);
      throw error;
    }
  }
}
