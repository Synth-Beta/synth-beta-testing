// Vercel serverless function for Ticketmaster attractions lookup
import { createClient } from '@supabase/supabase-js';

export default async (req, res) => {
  try {
    const origin = req.headers.origin;
    const allowedOrigins = [
      'https://synth-beta-testing.vercel.app',
      'https://synth-beta-testing-main.vercel.app',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:8080'
    ];

    if (origin && (allowedOrigins.includes(origin) || origin.includes('vercel.app'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY || 'rM94dPPl7ne1EAkGeZBEq5AH7zLvCAVA';
    const TICKETMASTER_BASE_URL = 'https://app.ticketmaster.com/discovery/v2';

    const params = new URLSearchParams();
    params.append('apikey', TICKETMASTER_API_KEY);

    if (req.query.keyword) params.append('keyword', req.query.keyword);
    if (req.query.size) params.append('size', req.query.size);
    if (req.query.sort) params.append('sort', req.query.sort);
    if (req.query.classificationName) params.append('classificationName', req.query.classificationName);
    if (req.query.countryCode) params.append('countryCode', req.query.countryCode);
    if (req.query.stateCode) params.append('stateCode', req.query.stateCode);
    if (req.query.city) params.append('city', req.query.city);

    const url = `${TICKETMASTER_BASE_URL}/attractions.json?${params.toString()}`;
    console.log('Calling Ticketmaster attractions API:', url.replace(TICKETMASTER_API_KEY, '***'));

    let response;
    try {
      response = await fetch(url);
    } catch (fetchError) {
      console.error('Ticketmaster attractions fetch error:', fetchError);
      res.status(500).json({
        success: false,
        error: 'Failed to reach Ticketmaster attractions API',
        details: fetchError.message
      });
      return;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('Ticketmaster attractions API error:', response.status, errorText);
      res.status(response.status).json({
        success: false,
        error: `Ticketmaster attractions API error: ${response.status} ${response.statusText}`,
        details: errorText.substring(0, 500)
      });
      return;
    }

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error('Ticketmaster attractions JSON parse error:', jsonError);
      res.status(500).json({
        success: false,
        error: 'Failed to parse Ticketmaster attractions API response',
        details: jsonError.message
      });
      return;
    }

    if (data.errors && data.errors.length > 0) {
      console.error('Ticketmaster attractions API returned errors:', data.errors);
      res.status(400).json({
        success: false,
        error: 'Ticketmaster attractions API returned errors',
        details: data.errors
      });
      return;
    }

    const attractions = data._embedded?.attractions || [];

    // Optionally cache basic attraction info in Supabase for reuse
    if (attractions.length > 0) {
      try {
        const supabaseUrl = process.env.SUPABASE_URL || 'https://glpiolbrafqikqhnseto.supabase.co';
        const supabaseKey =
          process.env.SUPABASE_ANON_KEY ||
          process.env.SUPABASE_SERVICE_ROLE_KEY ||
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';
        const supabase = createClient(supabaseUrl, supabaseKey);

        const mapped = attractions.map(attraction => ({
          jambase_artist_id: attraction.id,
          name: attraction.name,
          identifier: attraction.id ? `ticketmaster:${attraction.id}` : null,
          image_url: attraction.images?.[0]?.url || null,
          url: attraction.url || null,
          date_published: new Date().toISOString(),
          date_modified: new Date().toISOString()
        }));

        const unique = mapped.filter(item => item.jambase_artist_id);
        if (unique.length > 0) {
          try {
            await supabase
              .from('artists')
              .upsert(unique, { onConflict: 'jambase_artist_id', ignoreDuplicates: false });
          } catch (dbError) {
            console.warn('Supabase cache of Ticketmaster attractions failed:', dbError.message || dbError);
          }
        }
      } catch (cacheError) {
        console.warn('Ticketmaster attractions caching skipped due to error:', cacheError.message || cacheError);
      }
    }

    res.json({
      success: true,
      attractions,
      page: data.page || null
    });
  } catch (error) {
    console.error('Unexpected Ticketmaster attractions handler error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

