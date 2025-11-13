const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Initialize Supabase client with defaults
const supabaseUrl = process.env.SUPABASE_URL || 'https://glpiolbrafqikqhnseto.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';

const supabase = createClient(supabaseUrl, supabaseKey);

// POST /api/user/streaming-profile - Upload streaming profile data
router.post('/api/user/streaming-profile', async (req, res) => {
  try {
    const { service, data, userId } = req.body;

    if (!service || !data) {
      return res.status(400).json({
        error: 'Missing required fields: service and data'
      });
    }

    // Validate service type
    const validServices = ['spotify', 'apple-music'];
    if (!validServices.includes(service)) {
      return res.status(400).json({
        error: 'Invalid service type. Must be one of: spotify, apple-music'
      });
    }

    // For now, we'll store the data in a generic streaming_profiles table
    // In a real implementation, you might want separate tables for each service
    const profileData = {
      user_id: userId || null, // If no userId provided, we'll need to get it from auth
      service_type: service,
      profile_data: data,
      last_updated: new Date().toISOString(),
      sync_status: 'completed'
    };

    // Check if profile already exists for this user/service
    const { data: existingProfile, error: fetchError } = await supabase
      .from('streaming_profiles')
      .select('id')
      .eq('user_id', userId || 'anonymous') // Handle anonymous users for now
      .eq('service_type', service)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error checking existing profile:', fetchError);
      return res.status(500).json({
        error: 'Database error while checking existing profile'
      });
    }

    let result;
    if (existingProfile) {
      // Update existing profile
      const { data: updatedProfile, error: updateError } = await supabase
        .from('streaming_profiles')
        .update(profileData)
        .eq('id', existingProfile.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating profile:', updateError);
        return res.status(500).json({
          error: 'Failed to update streaming profile'
        });
      }

      result = updatedProfile;
    } else {
      // Create new profile
      const { data: newProfile, error: insertError } = await supabase
        .from('streaming_profiles')
        .insert(profileData)
        .select()
        .single();

      if (insertError) {
        console.error('Error creating profile:', insertError);
        return res.status(500).json({
          error: 'Failed to create streaming profile'
        });
      }

      result = newProfile;
    }

    // Also update user's music_streaming_profile field if userId is provided
    if (userId) {
      const profileUrl = service === 'spotify' 
        ? data.external_urls?.spotify || `spotify:user:${userId}`
        : data.storefront ? `apple-music:${data.storefront}` : 'apple-music';

      const { error: userUpdateError } = await supabase
        .from('profiles')
        .update({ 
          music_streaming_profile: profileUrl,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (userUpdateError) {
        console.warn('Warning: Failed to update user profile with streaming URL:', userUpdateError);
        // Don't fail the request for this
      }
    }

    res.json({
      success: true,
      profile: {
        id: result.id,
        service: result.service_type,
        lastUpdated: result.last_updated,
        syncStatus: result.sync_status
      }
    });

  } catch (error) {
    console.error('Streaming profile upload error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// GET /api/user/streaming-profile/:service - Get streaming profile data
router.get('/api/user/streaming-profile/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        error: 'Missing userId parameter'
      });
    }

    const { data: profile, error } = await supabase
      .from('streaming_profiles')
      .select('*')
      .eq('user_id', userId)
      .eq('service_type', service)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Profile not found'
        });
      }
      console.error('Error fetching profile:', error);
      return res.status(500).json({
        error: 'Failed to fetch streaming profile'
      });
    }

    res.json({
      success: true,
      profile: {
        id: profile.id,
        service: profile.service_type,
        data: profile.profile_data,
        lastUpdated: profile.last_updated,
        syncStatus: profile.sync_status
      }
    });

  } catch (error) {
    console.error('Streaming profile fetch error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// DELETE /api/user/streaming-profile/:service - Delete streaming profile data
router.delete('/api/user/streaming-profile/:service', async (req, res) => {
  try {
    const { service } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'Missing userId in request body'
      });
    }

    const { error } = await supabase
      .from('streaming_profiles')
      .delete()
      .eq('user_id', userId)
      .eq('service_type', service);

    if (error) {
      console.error('Error deleting profile:', error);
      return res.status(500).json({
        error: 'Failed to delete streaming profile'
      });
    }

    res.json({
      success: true,
      message: 'Streaming profile deleted successfully'
    });

  } catch (error) {
    console.error('Streaming profile delete error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// GET /api/streaming-profiles/stats - Get aggregated stats across all users
router.get('/api/streaming-profiles/stats', async (req, res) => {
  try {
    const { data: profiles, error } = await supabase
      .from('streaming_profiles')
      .select('service_type, profile_data, last_updated');

    if (error) {
      console.error('Error fetching profile stats:', error);
      return res.status(500).json({
        error: 'Failed to fetch streaming profile statistics'
      });
    }

    // Aggregate stats
    const stats = {
      totalProfiles: profiles.length,
      serviceBreakdown: {},
      recentSyncs: 0,
      topGenres: {},
      topArtists: {}
    };

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    profiles.forEach(profile => {
      // Service breakdown
      stats.serviceBreakdown[profile.service_type] = 
        (stats.serviceBreakdown[profile.service_type] || 0) + 1;

      // Recent syncs
      if (new Date(profile.last_updated) > oneWeekAgo) {
        stats.recentSyncs++;
      }

      // Extract genres and artists from profile data
      if (profile.profile_data && profile.profile_data.topGenres) {
        profile.profile_data.topGenres.forEach(genre => {
          stats.topGenres[genre] = (stats.topGenres[genre] || 0) + 1;
        });
      }

      if (profile.profile_data && profile.profile_data.topArtists) {
        profile.profile_data.topArtists.slice(0, 5).forEach(artist => {
          const artistName = artist.name || artist.attributes?.name;
          if (artistName) {
            stats.topArtists[artistName] = (stats.topArtists[artistName] || 0) + 1;
          }
        });
      }
    });

    // Sort and limit top items
    stats.topGenres = Object.entries(stats.topGenres)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});

    stats.topArtists = Object.entries(stats.topArtists)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Streaming profile stats error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;
