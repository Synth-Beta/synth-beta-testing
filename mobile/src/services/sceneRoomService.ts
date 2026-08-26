/**
 * Scene room membership (Expo) — density persistent rooms for DC onboarding.
 * Wraps @synth/shared applyOnboardingRoomJoins (LOI-562 / LOI-612).
 */
import {
  applyOnboardingRoomJoins,
  OPTIONAL_SCENE_ROOM_2_ENABLED,
  SCENE_ROOMS,
  type ApplyOnboardingRoomJoinsInput,
  type ApplyOnboardingRoomJoinsResult,
  type OnboardingPreferenceId,
  type SceneRoomId,
} from '@synth/shared';
import { supabase } from '../integrations/supabase/client';

export class SceneRoomService {
  static getRooms() {
    return SCENE_ROOMS;
  }

  static isOptionalRoom2Enabled(): boolean {
    return OPTIONAL_SCENE_ROOM_2_ENABLED;
  }

  static async applyOnboardingJoins(
    input: ApplyOnboardingRoomJoinsInput
  ): Promise<ApplyOnboardingRoomJoinsResult> {
    return applyOnboardingRoomJoins(supabase, {
      ...input,
      optionalRoom2Enabled:
        input.optionalRoom2Enabled ?? OPTIONAL_SCENE_ROOM_2_ENABLED,
    });
  }
}

export type { OnboardingPreferenceId, SceneRoomId };
