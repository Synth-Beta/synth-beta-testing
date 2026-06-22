<!-- aaa59040-ca18-485c-a15a-2d54ae459b1f 80837fdd-1503-4e76-b611-eafb0b8fe0e4 -->
# Fix Quick Event Search Auto-population

## Problem

When users select an event from the quick search dropdown in the review form, the artist, venue, and date fields don't visually update to show the confirmed selections. The data is being set in `formData`, but the UI lock states (`artistLocked` and `venueLocked`) are not being updated, causing the search boxes to remain visible instead of showing the confirmed selections.

## Root Cause

In `src/components/reviews/ReviewFormSteps/EventDetailsStep.tsx`, the `applyEventSelection` function (lines 73-83) updates the form data but doesn't set the `artistLocked` and `venueLocked` states to `true`. This causes the UI to continue showing the search boxes instead of the locked/confirmed displays.

## Solution

Modify the `applyEventSelection` function to set both lock states after updating the form data:

### File: `src/components/reviews/ReviewFormSteps/EventDetailsStep.tsx`

**Update lines 73-83:**

```typescript
const applyEventSelection = (ev: any) => {
  const eventDate = ev?.event_date ? String(ev.event_date).split('T')[0] : '';
  const selectedArtist = ev?.artist_name ? ({ id: ev.artist_id || `manual-${ev.artist_name}`, name: ev.artist_name, is_from_database: !!ev.artist_id } as any) : null;
  const selectedVenue = ev?.venue_name ? ({ id: ev.venue_id || `manual-${ev.venue_name}`, name: ev.venue_name, is_from_database: !!ev.venue_id } as any) : null;
  const updates: Partial<ReviewFormData> = { reviewType: 'event' } as any;
  if (selectedArtist) (updates as any).selectedArtist = selectedArtist;
  if (selectedVenue) (updates as any).selectedVenue = selectedVenue;
  if (eventDate) (updates as any).eventDate = eventDate;
  onUpdateFormData(updates);
  setShowEventResults(false);
  
  // Lock the fields to show confirmed selections
  if (selectedArtist) setArtistLocked(true);
  if (selectedVenue) setVenueLocked(true);
};
```

## Expected Behavior After Fix

1. User types in the quick search box (e.g., "drake")
2. User clicks on an event from the dropdown results
3. Artist field shows green confirmed box with artist name and a remove button
4. Venue field shows green confirmed box with venue name and a remove button
5. Date field is automatically populated
6. User can immediately proceed to rate and submit the review without additional steps

## Testing

1. Open review form
2. Type an artist name in "Quick search existing event"
3. Select an event from the dropdown
4. Verify all three fields show as locked/confirmed with green boxes
5. Verify the submit button works properly

### To-dos

- [ ] Create LandingPage.tsx with hero, features, how-it-works, and CTA sections
- [ ] Update App.tsx routing to show landing page at / and app at /app
- [ ] Update AppPage to check auth and redirect unauthenticated users to landing
- [ ] Convert Auth component to standalone page at /auth route
- [ ] Add logic to bypass landing page for authenticated users
- [ ] Test: new user signup → onboarding → app, existing user → app directly