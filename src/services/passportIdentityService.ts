import { supabase } from '@/integrations/supabase/client';

export interface PassportIdentity {
  user_id: string;
  fan_type: 'jam_chaser' | 'venue_purist' | 'scene_builder' | 'road_tripper' | 'genre_explorer' | 'festival_fanatic' | null;
  home_scene_id: string | null;
  join_year: number;
  calculated_at: string;
  updated_at: string;
  home_scene?: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
  } | null;
  home_city?: string | null; // User's location city from users.location_city
}

export class PassportIdentityService {
  /**
   * Get or calculate fan type
   */
  static async getFanType(userId: string): Promise<string | null> {
    try {
      const identity = await this.getIdentity(userId);
      if (identity?.fan_type) {
        return identity.fan_type;
      }

      // Calculate if not exists
      await this.calculateIdentity(userId);
      const updatedIdentity = await this.getIdentity(userId);
      return updatedIdentity?.fan_type || null;
    } catch (error) {
      console.error('Error getting fan type:', error);
      return null;
    }
  }

  /**
   * Get or calculate home scene
   */
  static async getHomeScene(userId: string) {
    try {
      const identity = await this.getIdentity(userId);
      return identity?.home_scene || null;
    } catch (error) {
      console.error('Error getting home scene:', error);
      return null;
    }
  }

  /**
   * Get join year
   */
  static async getJoinYear(userId: string): Promise<number | null> {
    try {
      const identity = await this.getIdentity(userId);
      return identity?.join_year || null;
    } catch (error) {
      console.error('Error getting join year:', error);
      return null;
    }
  }

  /**
   * Get full identity
   */
  static async getIdentity(userId: string): Promise<PassportIdentity | null> {
    try {
      // Fetch identity first - try with explicit column selection to avoid 406 errors
      // PostgREST sometimes has issues with select('*') on certain tables
      const { data: identityData, error: identityError } = await supabase
        .from('passport_identity')
        .select('user_id, fan_type, home_scene_id, join_year, calculated_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      // Handle 406 (Not Acceptable) errors specifically
      if (identityError) {
        // If it's a 406 error, try an alternative approach using RPC or different query
        if (identityError.code === '406' || identityError.message?.includes('406')) {
          console.warn('Received 406 error for passport_identity query, trying alternative approach');
          // Try without maybeSingle first
          const { data: altData, error: altError } = await supabase
            .from('passport_identity')
            .select('user_id, fan_type, home_scene_id, join_year, calculated_at, updated_at')
            .eq('user_id', userId)
            .limit(1);
          
          if (altError) {
            console.error('Alternative passport_identity query also failed:', altError);
            throw altError;
          }
          
          if (!altData || altData.length === 0) {
            return null;
          }
          
          // Use the first result
          const firstResult = altData[0];
          
          // Get user's location city directly
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('location_city')
            .eq('user_id', userId)
            .maybeSingle();
            
          if (userError) {
            console.error('Error fetching user location_city:', userError);
          }

          return {
            ...firstResult,
            home_scene: null, // Not using scenes anymore
            home_city: userData?.location_city || null,
          } as PassportIdentity;
        }
        
        // For other errors, only throw if it's not a "not found" error
        if (identityError.code !== 'PGRST116') {
          throw identityError;
        }
      }
      
      if (!identityData) return null;

      // Get user's location city directly
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('location_city')
        .eq('user_id', userId)
        .maybeSingle();
        
      if (userError) {
        console.error('Error fetching user location_city:', userError);
      }

      return {
        ...identityData,
        home_scene: null, // Not using scenes anymore
        home_city: userData?.location_city || null,
      } as PassportIdentity;
    } catch (error) {
      console.error('Error fetching passport identity:', error);
      return null;
    }
  }

  /**
   * Calculate and update identity
   */
  static async calculateIdentity(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase.rpc('update_passport_identity', {
        p_user_id: userId,
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error calculating identity:', error);
      return false;
    }
  }

  /**
   * Calculate home scene (now just a no-op since we fetch it directly from location_city)
   */
  static async calculateHomeScene(userId: string): Promise<boolean> {
    // Home scene is now fetched directly based on users.location_city
    // No calculation needed
      return true;
  }

  /**
   * Get fan type display name and description
   */
  static getFanTypeDisplay(fanType: string | null): { name: string; description: string } {
    const types: Record<string, { name: string; description: string }> = {
      jam_chaser: {
        name: 'Jam Chaser',
        description: 'High artist loyalty, following favorite acts across multiple shows',
      },
      venue_purist: {
        name: 'Venue Purist',
        description: 'Prefers returning to favorite venues, values consistency and atmosphere',
      },
      scene_builder: {
        name: 'Scene Builder',
        description: 'Active participant across multiple music scenes, connects communities',
      },
      road_tripper: {
        name: 'Road Tripper',
        description: 'Explores diverse cities and regions, music is a journey',
      },
      genre_explorer: {
        name: 'Genre Explorer',
        description: 'Diverse musical tastes, always discovering new sounds',
      },
      festival_fanatic: {
        name: 'Festival Fanatic',
        description: 'Loves the festival experience, thrives on variety and community',
      },
    };

    return types[fanType || ''] || {
      name: 'Music Fan',
      description: 'Building your live music journey',
    };
  }
}

