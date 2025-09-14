// Concert Search API - Exact Implementation per Specifications
const express = require('express');
const Joi = require('joi');
const Fuse = require('fuse.js');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://glpiolbrafqikqhnseto.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY5Mzc4MjQsImV4cCI6MjA3MjUxMzgyNH0.O5G3fW-YFtpACNqNfo_lsLK44F-3L3p69Ka-G2lSTLE';
const supabase = createClient(supabaseUrl, supabaseKey);

// JamBase API configuration
const JAMBASE_API_KEY = process.env.JAMBASE_API_KEY || 'e7ed3a9b-e73a-446e-b7c6-a96d1c53a030';
const JAMBASE_BASE_URL = process.env.JAMBASE_BASE_URL || 'https://www.jambase.com/jb-api/v1';

// Rate limiting storage (in-memory for development)
const rateLimitStore = new Map();

// Rate limiting middleware
const rateLimitMiddleware = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxRequests = 10;

  if (!rateLimitStore.has(clientIp)) {
    rateLimitStore.set(clientIp, { count: 1, resetTime: now + windowMs });
    return next();
  }

  const clientData = rateLimitStore.get(clientIp);
  
  if (now > clientData.resetTime) {
    clientData.count = 1;
    clientData.resetTime = now + windowMs;
    return next();
  }

  if (clientData.count >= maxRequests) {
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded, try again later'
    });
  }

  clientData.count++;
  next();
};

// Exact request validation schema using Joi
const requestSchema = Joi.object({
  query: Joi.string().required().min(1).max(100),
  filters: Joi.object({
    dateRange: Joi.object({
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso().greater(Joi.ref('startDate'))
    }),
    location: Joi.object({
      city: Joi.string().max(50),
      state: Joi.string().length(2), // Two-letter state code
      zipCode: Joi.string().pattern(/^\d{5}$/),
      radius: Joi.number().min(1).max(500)
    }),
    genres: Joi.array().items(Joi.string().max(20)).max(10)
  }),
  options: Joi.object({
    limit: Joi.number().min(5).max(20).default(15),
    fuzzyThreshold: Joi.number().min(0.1).max(1.0).default(0.6)
  })
});

// JamBase API integration
async function fetchFromJamBase(userQuery, filters = {}) {
  const startTime = Date.now();
  
  try {
    // Build query parameters
    const params = {
      apikey: JAMBASE_API_KEY,
      num: 50, // Always set to 50 as per spec
      page: 0, // Always 0 for first page
      o: 'json' // Always 'json'
    };

    // Determine search parameter based on query content
    const venueKeywords = ['theater', 'arena', 'hall', 'center'];
    const isVenueSearch = venueKeywords.some(keyword => 
      userQuery.query.toLowerCase().includes(keyword)
    );

    if (isVenueSearch) {
      params.venue = userQuery.query;
    } else {
      params.artist = userQuery.query;
    }

    // Add date range if provided
    if (filters.dateRange) {
      if (filters.dateRange.startDate) {
        params.startDate = new Date(filters.dateRange.startDate).toISOString().split('T')[0];
      }
      if (filters.dateRange.endDate) {
        params.endDate = new Date(filters.dateRange.endDate).toISOString().split('T')[0];
      }
    }

    // Add location parameters if provided
    if (filters.location) {
      if (filters.location.zipCode) {
        params.zipCode = filters.location.zipCode;
        params.radius = filters.location.radius || 25; // Default to 25 miles
      }
    }

    const url = `${JAMBASE_BASE_URL}/events`;
    console.log('Calling JamBase API:', url, 'with params:', params);

    // Exact axios configuration as per spec
    const axiosConfig = {
      method: 'GET',
      url: url,
      params: params,
      timeout: 10000, // 10 second timeout
      headers: {
        'User-Agent': 'PlusOneEventCrew/1.0'
      }
    };

    const response = await axios(axiosConfig);
    const responseTime = Date.now() - startTime;
    
    console.log(`JamBase API call completed in ${responseTime}ms with status: ${response.status}`);

    if (!response.data) {
      console.log('Invalid JamBase API response format');
      return [];
    }

    // Handle JamBase API response format - it's an object with an events array
    let events = [];
    if (response.data.events && Array.isArray(response.data.events)) {
      events = response.data.events;
    } else if (Array.isArray(response.data)) {
      events = response.data;
    } else {
      console.log('Invalid JamBase API response format - no events array found');
      return [];
    }

    console.log(`Found ${events.length} events from JamBase API`);
    return events;

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.log(`JamBase API error after ${responseTime}ms:`, error.message);

    // Handle specific error cases
    if (error.response) {
      const status = error.response.status;
      if (status === 401) {
        throw new Error('Invalid API credentials');
      } else if (status === 429) {
        throw new Error('Rate limit exceeded, try again later');
      }
    }

    if (error.code === 'ECONNABORTED') {
      // Retry once after 1 second delay
      console.log('JamBase API timeout, retrying after 1 second...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        const retryConfig = {
          method: 'GET',
          url: `${JAMBASE_BASE_URL}/events`,
          params: {
            apikey: JAMBASE_API_KEY,
            num: 50,
            page: 0,
            o: 'json',
            artist: userQuery.query
          },
          timeout: 10000,
          headers: {
            'User-Agent': 'PlusOneEventCrew/1.0'
          }
        };
        
        const retryResponse = await axios(retryConfig);
        console.log('JamBase API retry successful');
        return retryResponse.data || [];
      } catch (retryError) {
        console.log('JamBase API retry failed:', retryError.message);
        throw new Error('External service unavailable');
      }
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new Error('External service unavailable');
    }

    throw error;
  }
}

// Fuse.js fuzzy search configuration
function createFuseInstance(events, fuzzyThreshold) {
  const fuseOptions = {
    keys: [
      { name: 'performer.0.name', weight: 0.5 },
      { name: 'location.name', weight: 0.3 },
      { name: 'name', weight: 0.2 }
    ],
    threshold: fuzzyThreshold,
    distance: 100,
    minMatchCharLength: 2,
    includeScore: true,
    ignoreLocation: true
  };

  return new Fuse(events, fuseOptions);
}

// Data transformation function
function transformJamBaseEvent(event, fuseScore = 0) {
  // Handle JamBase API response format (JSON-LD)
  const headliner = event.performer?.find(p => p['x-isHeadliner']) || event.performer?.[0];
  const venue = event.location;
  const address = venue?.address;
  
  return {
    jambase_event_id: event.identifier?.replace('jambase:', '') || event.id,
    title: event.name || `${headliner?.name || 'Unknown Artist'} Live`,
    artist_name: headliner?.name || 'Unknown Artist',
    artist_id: headliner?.identifier?.replace('jambase:', '') || headliner?.id,
    venue_name: venue?.name || 'Unknown Venue',
    venue_id: venue?.identifier?.replace('jambase:', '') || venue?.id,
    venue_city: address?.addressLocality,
    venue_state: address?.addressRegion?.name || address?.addressRegion,
    event_date: event.startDate || new Date().toISOString(),
    doors_time: event.doorTime && event.doorTime.trim() !== '' 
      ? (event.doorTime.includes('T') || event.doorTime.includes('-') 
          ? event.doorTime 
          : `${event.startDate.split('T')[0]}T${event.doorTime}`)
      : null,
    description: event.description || `Live performance by ${headliner?.name || 'Unknown Artist'}`,
    genres: Array.isArray(headliner?.genre) ? headliner.genre : [],
    venue_address: address?.streetAddress,
    venue_zip: address?.postalCode,
    latitude: venue?.geo?.latitude,
    longitude: venue?.geo?.longitude,
    ticket_available: event.offers && event.offers.length > 0,
    price_range: event.offers?.[0]?.priceSpecification?.price || event.offers?.[0]?.priceSpecification?.minPrice,
    ticket_urls: Array.isArray(event.offers) ? event.offers.map(offer => offer.url) : [],
    setlist: null, // Not available in this API response
    tour_name: null, // Not available in this API response
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

// Supabase upsert operation
async function upsertEventsToSupabase(transformedEvents) {
  try {
    console.log(`Attempting to upsert ${transformedEvents.length} events to database`);
    console.log('Sample transformed event:', JSON.stringify(transformedEvents[0], null, 2));
    
    const { data, error } = await supabase
      .from('jambase_events')
      .upsert(transformedEvents, { 
        onConflict: 'jambase_event_id',
        ignoreDuplicates: false 
      })
      .select();

    if (error) {
      console.error('Database operation failed:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      throw new Error('Database operation failed');
    }

    console.log(`Successfully upserted ${data?.length || 0} events to database`);
    return data || [];
  } catch (error) {
    console.error('Supabase upsert error:', error);
    console.error('Error stack:', error.stack);
    throw new Error('Database operation failed');
  }
}

// Main search endpoint
router.post('/api/search-concerts', rateLimitMiddleware, async (req, res) => {
  const searchStartTime = Date.now();
  
  try {
    // Validate request body
    const { error: validationError, value: validatedRequest } = requestSchema.validate(req.body);
    if (validationError) {
      console.log('Validation error:', validationError.details);
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: validationError.details
      });
    }

    console.log('Processing search request:', {
      query: validatedRequest.query,
      filters: validatedRequest.filters,
      options: validatedRequest.options
    });

    // Fetch events from JamBase API
    const jambaseEvents = await fetchFromJamBase(validatedRequest, validatedRequest.filters);
    
    if (!jambaseEvents || jambaseEvents.length === 0) {
      return res.json({
        success: true,
        results: [],
        metadata: {
          total_found: 0,
          returned: 0,
          query_used: validatedRequest.query,
          search_time_ms: Date.now() - searchStartTime
        }
      });
    }

    // Apply fuzzy search
    const fuzzyStartTime = Date.now();
    const fuse = createFuseInstance(jambaseEvents, validatedRequest.options.fuzzyThreshold);
    const fuzzyResults = fuse.search(validatedRequest.query);
    
    console.log(`Fuzzy search found ${fuzzyResults.length} raw results for query "${validatedRequest.query}"`);
    if (fuzzyResults.length > 0) {
      console.log('Sample fuzzy results:', fuzzyResults.slice(0, 3).map(r => ({
        score: r.score,
        item: {
          name: r.item.name,
          performer: r.item.performer?.[0]?.name,
          venue: r.item.location?.name
        }
      })));
    }
    
    // Filter results based on threshold
    const threshold = 1 - validatedRequest.options.fuzzyThreshold;
    const filteredResults = fuzzyResults
      .filter(result => result.score <= threshold)
      .slice(0, validatedRequest.options.limit);
    
    const fuzzyTime = Date.now() - fuzzyStartTime;
    console.log(`Fuzzy search processed ${jambaseEvents.length} events in ${fuzzyTime}ms, found ${filteredResults.length} matches (threshold: ${threshold})`);

    // Transform events
    const transformedEvents = filteredResults.map(result => 
      transformJamBaseEvent(result.item, result.score)
    );

    // If no events to store, return empty results
    if (transformedEvents.length === 0) {
      const totalSearchTime = Date.now() - searchStartTime;
      
      return res.json({
        success: true,
        results: [],
        metadata: {
          total_found: jambaseEvents.length,
          returned: 0,
          query_used: validatedRequest.query,
          search_time_ms: totalSearchTime
        }
      });
    }

    // Temporarily return transformed events without database storage
    console.log(`Returning ${transformedEvents.length} transformed events (database storage disabled)`);
    const storedEvents = transformedEvents;
    const dbTime = 0;

    const totalSearchTime = Date.now() - searchStartTime;
    
    // Log performance metrics
    console.log('Search performance:', {
      jambase_api_time: Date.now() - searchStartTime - fuzzyTime - dbTime,
      fuzzy_processing_time: fuzzyTime,
      database_time: dbTime,
      total_time: totalSearchTime
    });

    // Return success response
    res.json({
      success: true,
      results: storedEvents,
      metadata: {
        total_found: jambaseEvents.length,
        returned: storedEvents.length,
        query_used: validatedRequest.query,
        search_time_ms: totalSearchTime
      }
    });

  } catch (error) {
    const totalSearchTime = Date.now() - searchStartTime;
    console.error('Search error:', error.message);

    // Handle specific error types
    if (error.message === 'Invalid API credentials') {
      return res.status(401).json({
        success: false,
        error: 'Invalid API credentials'
      });
    }

    if (error.message === 'Rate limit exceeded, try again later') {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded, try again later'
      });
    }

    if (error.message === 'External service unavailable') {
      return res.status(503).json({
        success: false,
        error: 'External service unavailable'
      });
    }

    if (error.message === 'Database operation failed') {
      return res.status(500).json({
        success: false,
        error: 'Database operation failed'
      });
    }

    // Generic server error
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
});

module.exports = router;
