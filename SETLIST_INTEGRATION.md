# Setlist Integration in Review Form

## Overview
Added a "View Setlist" button to the review creation form that allows users to search for and view setlists from Setlist.fm when creating reviews.

## Features Implemented

### 1. **Setlist Service** (`src/services/setlistService.ts`)
- **SetlistService class** with methods to search setlists
- **Rate limiting** (1 second between requests) to respect Setlist.fm API limits
- **Multiple search methods**:
  - `searchSetlistsByArtist()` - Search by artist name
  - `searchSetlistsByArtistAndVenue()` - Search by artist, venue, and date
  - `getSetlistForEvent()` - Get setlist for existing event
- **Data transformation** from Setlist.fm format to our internal format

### 2. **Setlist Modal Component** (`src/components/reviews/SetlistModal.tsx`)
- **Full-screen modal** with setlist display
- **Smart search** based on available data:
  - Artist name (required)
  - Venue name (optional)
  - Event date (optional)
- **Setlist display features**:
  - Artist, venue, date, and tour information
  - Songs grouped by set with position numbers
  - Cover song indicators
  - Tape indicators
  - Song count and set count
  - Direct link to Setlist.fm
- **Loading states** and error handling
- **Responsive design** with proper pagination

### 3. **Review Form Integration** (`src/components/reviews/ReviewFormSteps/EventDetailsStep.tsx`)
- **"View Setlist" button** appears when artist is selected
- **Button placement** below the selected artist
- **Modal integration** with form data
- **Automatic data passing** (artist, venue, date) to setlist search

## How It Works

### **User Flow:**
1. User starts creating a review
2. User selects an artist from the search
3. **"View Setlist" button appears** below the selected artist
4. User clicks "View Setlist"
5. **Modal opens** and searches Setlist.fm for setlists
6. **Setlists display** with full song lists, sets, and metadata
7. User can view multiple setlists and click through to Setlist.fm

### **Search Logic:**
```typescript
// Priority order for search parameters:
1. Artist + Venue + Date (most specific)
2. Artist + Date (moderately specific)  
3. Artist only (broadest search)
```

### **Data Flow:**
```
Review Form → Artist Selected → "View Setlist" Button → 
SetlistModal → SetlistService → Setlist.fm API → 
Formatted Results → Display in Modal
```

## API Integration

### **Setlist.fm API:**
- **Endpoint:** `https://api.setlist.fm/rest/1.0/search/setlists`
- **Authentication:** API key in headers
- **Rate limiting:** 1 second between requests
- **Search parameters:** artistName, venueName, date, cityName, stateCode

### **Data Transformation:**
- **Input:** Setlist.fm JSON format
- **Output:** Internal SetlistData interface
- **Features:** Song grouping, set organization, metadata extraction

## UI/UX Features

### **Button Design:**
- **Icon:** Music note (🎵)
- **Text:** "View Setlist"
- **Style:** Outline button, small size
- **Placement:** Below selected artist

### **Modal Design:**
- **Size:** Large modal (max-w-4xl, 90vh)
- **Layout:** Header + scrollable content
- **Cards:** Each setlist in its own card
- **Information hierarchy:** Artist → Date → Venue → Tour → Songs

### **Setlist Display:**
- **Header:** Artist name, date, venue, tour
- **Metadata:** Song count, set count badges
- **Songs:** Grid layout with position numbers
- **Special indicators:** Cover songs, tape markers
- **External link:** "View on Setlist.fm" button

## Error Handling

### **API Errors:**
- **404:** No setlists found (graceful handling)
- **Rate limiting:** Automatic delays between requests
- **Network errors:** User-friendly error messages

### **UI States:**
- **Loading:** Spinner with "Searching for setlists..." message
- **No results:** "No Setlists Found" with retry button
- **Error:** Error message with retry option

## Files Created/Modified

### **New Files:**
1. ✅ `src/services/setlistService.ts` - Setlist API service
2. ✅ `src/components/reviews/SetlistModal.tsx` - Setlist display modal

### **Modified Files:**
1. ✅ `src/components/reviews/ReviewFormSteps/EventDetailsStep.tsx` - Added setlist button

## Testing

### **Test Scenarios:**
1. ✅ Select artist → "View Setlist" button appears
2. ✅ Click button → Modal opens and searches
3. ✅ Search with artist only → Returns multiple setlists
4. ✅ Search with artist + venue + date → Returns specific setlists
5. ✅ No results found → Shows appropriate message
6. ✅ API error → Shows error with retry option
7. ✅ Click "View on Setlist.fm" → Opens external link

### **Edge Cases:**
- ✅ Artist with no setlists
- ✅ Network connectivity issues
- ✅ API rate limiting
- ✅ Invalid date formats
- ✅ Special characters in artist/venue names

## Future Enhancements

### **Potential Improvements:**
1. **Setlist selection** - Allow users to select a specific setlist for their review
2. **Setlist comparison** - Compare multiple setlists for the same artist
3. **Setlist favorites** - Save favorite setlists
4. **Setlist sharing** - Share setlists with friends
5. **Setlist integration** - Auto-populate review with setlist data

### **Performance Optimizations:**
1. **Caching** - Cache setlist results
2. **Debouncing** - Debounce search requests
3. **Pagination** - Handle large result sets
4. **Lazy loading** - Load setlist details on demand

---

**Status: ✅ COMPLETE - Setlist integration fully implemented and ready for use**
