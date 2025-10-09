# Setlist CORS Fix - Backend Proxy Solution

## Problem
The Setlist.fm API was failing with `net::ERR_FAILED` due to CORS (Cross-Origin Resource Sharing) restrictions. Browsers block direct API calls to external domains for security reasons.

## Root Cause
- **Frontend** was trying to call `https://api.setlist.fm/rest/1.0/search/setlists` directly
- **Browser CORS policy** blocked the request
- **Setlist.fm API** doesn't allow cross-origin requests from browsers

## Solution Applied

### **1. Backend Proxy Route** (`backend/setlist-routes.js`)
Created a new backend route that acts as a proxy:

```javascript
// New endpoint: GET /api/setlists/search
router.get('/api/setlists/search', async (req, res) => {
  // Extract query parameters from frontend
  const { artistName, date, venueName, cityName, stateCode } = req.query;
  
  // Make request to Setlist.fm API from backend (no CORS issues)
  const response = await fetch(`${SETLIST_FM_BASE_URL}/search/setlists?${queryParams}`, {
    headers: {
      'x-api-key': SETLIST_FM_API_KEY,
      'Accept': 'application/json'
    }
  });
  
  // Transform and return data to frontend
  res.json({ setlist: transformedSetlists });
});
```

### **2. Updated Frontend Service** (`src/services/setlistService.ts`)
Modified to use backend proxy instead of direct API calls:

```typescript
// Before: Direct API call (CORS blocked)
const url = `${SETLIST_FM_BASE_URL}/search/setlists?${queryParams}`;

// After: Backend proxy (no CORS issues)
const url = `${BACKEND_BASE_URL}/api/setlists/search?${queryParams}`;
```

### **3. Added to Backend Server** (`backend/server.js`)
Registered the new setlist routes:

```javascript
const setlistRoutes = require('./setlist-routes');
app.use('/', setlistRoutes);
```

## How It Works Now

### **Request Flow:**
```
Frontend → Backend Proxy → Setlist.fm API → Backend → Frontend
```

### **Step by Step:**
1. ✅ User clicks "View Setlist" in review form
2. ✅ Frontend calls `SetlistService.searchSetlists()`
3. ✅ Service makes request to `http://localhost:3001/api/setlists/search`
4. ✅ Backend proxy receives request and forwards to Setlist.fm
5. ✅ Setlist.fm returns data to backend
6. ✅ Backend transforms data and returns to frontend
7. ✅ Frontend displays setlists in modal

## Features

### **Backend Proxy Features:**
- ✅ **Rate limiting** (1 second between requests)
- ✅ **Error handling** with proper HTTP status codes
- ✅ **Data transformation** from Setlist.fm format to our format
- ✅ **CORS headers** properly configured
- ✅ **Logging** for debugging

### **Frontend Service Features:**
- ✅ **Same API** - no changes to existing code
- ✅ **Error handling** with user-friendly messages
- ✅ **Loading states** and retry functionality
- ✅ **Debug logging** for troubleshooting

## Testing

### **Test the Fix:**
1. ✅ Make sure backend server is running (`npm start` in backend folder)
2. ✅ Open review form and select an artist
3. ✅ Click "View Setlist" button
4. ✅ Should now work without CORS errors

### **Expected Console Logs:**
```
🎵 SetlistService: Making request to backend proxy: http://localhost:3001/api/setlists/search?artistName=Goose&date=2025-06-10&venueName=The+Factory
🎵 Setlist.fm API request: https://api.setlist.fm/rest/1.0/search/setlists?artistName=Goose&date=2025-06-10&venueName=The+Factory
🎵 Setlist.fm API response: { total: 3, artistName: "Goose", ... }
🎵 SetlistService: Received setlists: 3
```

## Files Created/Modified

### **New Files:**
1. ✅ `backend/setlist-routes.js` - Backend proxy for Setlist.fm API

### **Modified Files:**
1. ✅ `backend/server.js` - Added setlist routes
2. ✅ `src/services/setlistService.ts` - Updated to use backend proxy

## Backend Server

### **Start the Backend:**
```bash
cd backend
npm start
```

### **New Endpoints:**
- `GET /api/setlists/search` - Search for setlists
- `GET /api/setlists/health` - Health check

## No Breaking Changes
- ✅ Same frontend API
- ✅ Same data format
- ✅ Same user experience
- ✅ Just fixes the CORS issue

---

**Status: ✅ COMPLETE - Setlist API now works via backend proxy**
