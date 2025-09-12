# Unified Event Search Flow

## Overview

The new unified search system provides a single search interface that intelligently searches both our Supabase database and the JamBase API, with fuzzy matching to help users find and select the correct events.

## Key Features

### 1. Single Search Bar
- One input field for searching by artist, venue, or event name
- Optional date filter to narrow down results
- Real-time search with debouncing (300ms)

### 2. Hybrid Search Strategy
- **First**: Searches existing events in Supabase database
- **Second**: Searches JamBase API for new events
- **Result**: Combines both sources with intelligent ranking

### 3. Fuzzy Matching
- Uses fuzzy string matching to find similar events
- Confidence scoring (0-100%) for each result
- Visual indicators showing match quality

### 4. Smart Event Selection
- **Existing Events**: If found in Supabase, links to user's profile
- **New Events**: If from JamBase, creates in Supabase and links to user
- Clear visual feedback showing event source and status

## Components

### `UnifiedEventSearch.tsx`
Main search component with:
- Single search input with autocomplete
- Date picker for filtering
- Real-time suggestions with confidence scores
- Event selection handling

### `hybridSearchService.ts`
Service layer providing:
- Parallel search of Supabase and JamBase
- Fuzzy matching algorithm
- Event creation and user linking
- Confidence scoring

### `ConcertSearch.tsx` (Updated)
Updated to use the new unified search:
- Replaced separate form components
- Integrated with new search flow
- Maintains existing user events display

## Search Flow

1. **User Types Query**: Enters artist, venue, or event name
2. **Parallel Search**: System searches both Supabase and JamBase
3. **Fuzzy Matching**: Results are scored and ranked by relevance
4. **Display Suggestions**: Shows up to 15 results with confidence scores
5. **User Selection**: User clicks on desired event
6. **Smart Handling**: 
   - Existing event → Links to user
   - New event → Creates in Supabase, then links to user
7. **Feedback**: Shows success message and updates user's event list

## Visual Indicators

- **Badge Colors**: 
  - Green: High confidence match (80%+)
  - Yellow: Medium confidence match (60-79%)
  - Gray: Lower confidence match (30-59%)
- **Source Badges**:
  - "In Database": Event exists in Supabase
  - "JamBase": Event from external API
- **Status Icons**:
  - CheckCircle: Existing event selected
  - PlusCircle: New event to be added

## Benefits

1. **Simplified UX**: One search bar instead of multiple forms
2. **Comprehensive Results**: Searches both local and external data
3. **Intelligent Matching**: Fuzzy search finds similar events
4. **Automatic Management**: Handles event creation and user linking
5. **Clear Feedback**: Users understand what's happening at each step

## Technical Implementation

- **Debounced Search**: 300ms delay to avoid excessive API calls
- **Parallel Processing**: Supabase and JamBase searches run simultaneously
- **Error Handling**: Graceful fallbacks if one source fails
- **Type Safety**: Full TypeScript support with proper interfaces
- **Performance**: Limits results to 15 items for optimal UX
