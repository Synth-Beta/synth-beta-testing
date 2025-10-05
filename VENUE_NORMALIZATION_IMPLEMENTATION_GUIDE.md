# Venue Normalization Implementation Guide

## 🎯 Overview

This guide provides a comprehensive plan to normalize venue data across all Supabase tables to ensure consistent venue searching and data integrity. The current audit revealed several issues that need to be addressed.

## 📊 Current State Analysis

### Database Tables with Venue Data:
1. **`jambase_events`** - 926 records, 9 unique venues ✅ (Primary data source)
2. **`venues`** - 1 record ❌ (Underutilized)
3. **`events`** - Missing ❌ (Table doesn't exist)
4. **`concerts`** - Missing ❌ (Table doesn't exist)
5. **`user_events`** - Empty ❌ (No data)

### Key Issues Identified:
- ❌ Venue names stored as text in multiple tables without normalization
- ❌ No foreign key relationships between venue data
- ❌ Duplicate venue entries possible
- ❌ Inconsistent venue name formatting
- ❌ Missing venue metadata (coordinates, addresses)
- ❌ No unified venue search functionality

## 🚀 Implementation Plan

### Phase 1: Database Schema Updates

#### 1.1 Run the Venue Normalization SQL
```bash
# Execute the comprehensive venue normalization script
psql -h your-supabase-host -U postgres -d postgres -f venue_normalization_plan.sql
```

#### 1.2 Verify Database Changes
```sql
-- Check venues table population
SELECT COUNT(*) FROM public.venues;

-- Check jambase_events venue_id linking
SELECT COUNT(*) FROM public.jambase_events WHERE venue_id IS NOT NULL;

-- Test venue search function
SELECT * FROM public.search_venues('The Anthem', 5);
```

### Phase 2: Application Code Updates

#### 2.1 Update EventMap Component
The `EventMap.tsx` component needs to use the new venue service:

```typescript
// In EventMap.tsx
import VenueService from '@/services/venueService';

// Replace venue name handling with venue ID
const handleVenueClick = async (venueId: string) => {
  const venue = await VenueService.getVenueWithEvents(venueId);
  if (venue) {
    console.log('🏢 Venue clicked:', {
      venueId: venue.id,
      venueName: venue.name,
      events: venue.events_count
    });
    // Handle venue selection
  }
};
```

#### 2.2 Update Search Components
Update search functionality to use normalized venue data:

```typescript
// In search components
const searchVenues = async (searchTerm: string) => {
  const results = await VenueService.searchVenues(searchTerm);
  return results.map(venue => ({
    id: venue.id,
    name: venue.name,
    displayName: VenueService.getVenueDisplayName(venue),
    location: `${venue.city}, ${venue.state}`,
    eventsCount: venue.events_count
  }));
};
```

#### 2.3 Update Event Filtering
Modify event filters to work with venue IDs:

```typescript
// In EventFilters.tsx
const filterEventsByVenue = async (venueId: string) => {
  const { data } = await supabase
    .from('jambase_events')
    .select(`
      *,
      venues!inner(name, city, state)
    `)
    .eq('venue_id', venueId);
  
  return data;
};
```

### Phase 3: Data Migration

#### 3.1 Migrate Existing Data
If you have existing event data in other formats, migrate it:

```sql
-- Example: Migrate from a temporary events table
INSERT INTO public.jambase_events (
  title, artist_name, venue_name, event_date, venue_id
)
SELECT 
  e.title,
  e.artist,
  e.venue,
  e.datetime,
  v.id
FROM temporary_events e
JOIN public.venues v ON LOWER(TRIM(e.venue)) = LOWER(TRIM(v.name));
```

#### 3.2 Clean Up Orphaned Data
Remove any data that doesn't have proper venue references:

```sql
-- Remove jambase_events without venue_id
DELETE FROM public.jambase_events 
WHERE venue_id IS NULL AND venue_name IS NULL;
```

### Phase 4: Search Integration

#### 4.1 Update SearchMap Component
```typescript
// In SearchMap.tsx
const searchVenuesInArea = async (bounds: LatLngBounds) => {
  const venues = await VenueService.getVenuesWithinRadius(
    bounds.getCenter().lat(),
    bounds.getCenter().lng(),
    50 // 50km radius
  );
  
  return venues.map(venue => ({
    ...venue,
    coordinates: VenueService.getVenueCoordinates(venue)
  }));
};
```

#### 4.2 Implement Fuzzy Search
```typescript
// Add to search functionality
const handleVenueSearch = async (query: string) => {
  if (query.length < 2) return [];
  
  const results = await VenueService.searchVenues(query, 10);
  
  return results.map(result => ({
    id: result.id,
    name: result.name,
    similarity: result.similarity,
    location: `${result.city}, ${result.state}`,
    address: result.address
  }));
};
```

### Phase 5: UI/UX Improvements

#### 5.1 Venue Selection Component
Create a reusable venue picker:

```typescript
// components/VenuePicker.tsx
interface VenuePickerProps {
  onVenueSelect: (venue: Venue) => void;
  selectedVenueId?: string;
  placeholder?: string;
}

export const VenuePicker: React.FC<VenuePickerProps> = ({
  onVenueSelect,
  selectedVenueId,
  placeholder = "Search venues..."
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<VenueSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = useCallback(async (term: string) => {
    if (term.length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    const searchResults = await VenueService.searchVenues(term);
    setResults(searchResults);
    setIsLoading(false);
  }, []);

  return (
    <div className="venue-picker">
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          handleSearch(e.target.value);
        }}
        placeholder={placeholder}
        className="w-full p-2 border rounded"
      />
      
      {isLoading && <div>Searching...</div>}
      
      {results.length > 0 && (
        <div className="venue-results">
          {results.map((venue) => (
            <div
              key={venue.id}
              onClick={() => onVenueSelect(venue)}
              className="venue-result-item"
            >
              <div className="font-medium">{venue.name}</div>
              <div className="text-sm text-gray-600">
                {venue.address && `${venue.address}, `}
                {venue.city}, {venue.state}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

#### 5.2 Venue Display Component
```typescript
// components/VenueCard.tsx
interface VenueCardProps {
  venue: VenueWithStats;
  onClick?: (venue: Venue) => void;
}

export const VenueCard: React.FC<VenueCardProps> = ({ venue, onClick }) => {
  return (
    <div 
      className="venue-card"
      onClick={() => onClick?.(venue)}
    >
      <h3 className="venue-name">{venue.name}</h3>
      <p className="venue-location">
        {VenueService.formatVenueAddress(venue)}
      </p>
      <div className="venue-stats">
        <span>{venue.upcoming_events} upcoming events</span>
        <span>{venue.total_events} total events</span>
      </div>
      {venue.latitude && venue.longitude && (
        <div className="venue-coordinates">
          📍 {venue.latitude}, {venue.longitude}
        </div>
      )}
    </div>
  );
};
```

## 🔧 Testing & Validation

### 5.1 Test Venue Search
```typescript
// Test the venue search functionality
const testVenueSearch = async () => {
  console.log('Testing venue search...');
  
  // Test exact match
  const exactResults = await VenueService.searchVenues('The Anthem');
  console.log('Exact search results:', exactResults);
  
  // Test fuzzy match
  const fuzzyResults = await VenueService.searchVenues('anthem');
  console.log('Fuzzy search results:', fuzzyResults);
  
  // Test partial match
  const partialResults = await VenueService.searchVenues('930');
  console.log('Partial search results:', partialResults);
};
```

### 5.2 Test Venue Normalization
```typescript
// Test venue name normalization
const testNormalization = () => {
  const testCases = [
    '  The   Anthem  ',
    'THE ANTHEM',
    'the anthem',
    'The Anthem',
  ];
  
  testCases.forEach(name => {
    const normalized = VenueService.normalizeVenueName(name);
    console.log(`"${name}" → "${normalized}"`);
  });
};
```

### 5.3 Validate Data Integrity
```sql
-- Check for venues without events
SELECT v.name, v.city, v.state
FROM public.venues v
LEFT JOIN public.jambase_events je ON v.id = je.venue_id
WHERE je.id IS NULL;

-- Check for events without venue_id
SELECT COUNT(*) as orphaned_events
FROM public.jambase_events
WHERE venue_id IS NULL;

-- Check for duplicate venue names
SELECT name, COUNT(*) as count
FROM public.venues
GROUP BY LOWER(TRIM(name))
HAVING COUNT(*) > 1;
```

## 📋 Implementation Checklist

### Database Setup
- [ ] Execute `venue_normalization_plan.sql`
- [ ] Verify all functions are created
- [ ] Test venue search functions
- [ ] Validate data integrity

### Application Updates
- [ ] Update `EventMap.tsx` to use venue IDs
- [ ] Update `SearchMap.tsx` for venue search
- [ ] Update `EventFilters.tsx` for venue filtering
- [ ] Create `VenuePicker` component
- [ ] Create `VenueCard` component
- [ ] Update search functionality

### Testing
- [ ] Test venue search with various queries
- [ ] Test venue normalization functions
- [ ] Validate venue-event relationships
- [ ] Test map integration with venue coordinates
- [ ] Test venue filtering in search

### Performance Optimization
- [ ] Add database indexes for venue search
- [ ] Implement caching for venue data
- [ ] Optimize venue search queries
- [ ] Add pagination for venue results

## 🚨 Important Notes

1. **Backup First**: Always backup your database before running migration scripts
2. **Test Environment**: Test all changes in a development environment first
3. **Gradual Rollout**: Implement changes gradually to avoid breaking existing functionality
4. **Monitor Performance**: Watch for any performance issues after implementation
5. **User Feedback**: Collect user feedback on the new venue search experience

## 🔄 Maintenance

### Regular Tasks
- Monitor for duplicate venues
- Update venue coordinates as needed
- Clean up orphaned venue data
- Optimize search performance

### Future Enhancements
- Add venue photos and descriptions
- Implement venue ratings and reviews
- Add venue capacity and amenities
- Create venue management admin interface

## 📞 Support

If you encounter any issues during implementation:
1. Check the database logs for errors
2. Verify all environment variables are set
3. Test individual functions before full integration
4. Review the audit results for data inconsistencies

---

**Next Steps**: Start with Phase 1 (Database Schema Updates) and work through each phase systematically. The venue normalization will significantly improve the search experience and data consistency across your application.
