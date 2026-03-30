import { supabase } from '../integrations/supabase/client';

/** True if the user has linked a streaming account (profile URL and/or `streaming_profiles` row). */
export async function isStreamingLinked(userId: string): Promise<boolean> {
    const { data: userRow } = await supabase
        .from('users')
        .select('music_streaming_profile')
        .eq('user_id', userId)
        .maybeSingle();

    const profile = userRow?.music_streaming_profile;
    if (profile != null && String(profile).trim().length > 0) {
        return true;
    }

    const { data: streamingRows } = await supabase
        .from('streaming_profiles')
        .select('id')
        .eq('user_id', userId)
        .limit(1);

    return (streamingRows?.length ?? 0) > 0;
}
