# Venue Selection Debug - Added Logging

## Problem
The venue search isn't saving properly in the review form. Users can type in the venue field but the selection doesn't persist, showing "Please select a venue" error.

## Debugging Added

### 1. **Venue Selection Handler** (`EventDetailsStep.tsx`)
Added comprehensive logging to `handleVenueSelect`:

```typescript
const handleVenueSelect = (venue: VenueSearchResult) => {
  console.log('🎯 Venue selected in EventDetailsStep:', {
    name: venue.name,
    id: venue.id,
    is_from_database: venue.is_from_database,
    identifier: venue.identifier,
  });
  console.log('🎯 Before update - formData.selectedVenue:', formData.selectedVenue);
  console.log('🎯 Before update - venueLocked:', venueLocked);
  
  onUpdateFormData({ selectedVenue: venue });
  
  console.log('🎯 After update - setting venueLocked to true');
  setVenueLocked(true);
};
```

### 2. **Venue Render Logic** (`EventDetailsStep.tsx`)
Added logging to understand the render conditions:

```typescript
{(() => {
  console.log('🎯 Venue render check:', {
    hasSelectedVenue: !!formData.selectedVenue,
    venueLocked,
    selectedVenueName: formData.selectedVenue?.name,
    shouldShowSearch: !formData.selectedVenue || !venueLocked
  });
  return null;
})()}
```

### 3. **Form Data Updates** (`useReviewForm.ts`)
Added logging to track form state changes:

```typescript
const updateFormData = useCallback((updates: Partial<ReviewFormData>) => {
  console.log('🔄 useReviewForm: updateFormData called with:', updates);
  setState(prev => {
    const newFormData = { ...prev.formData, ...updates };
    
    console.log('🔄 useReviewForm: Previous formData:', prev.formData);
    console.log('🔄 useReviewForm: New formData:', newFormData);
    
    // ... rest of logic
    
    console.log('🔄 useReviewForm: Step validation errors:', stepErrors);
    console.log('🔄 useReviewForm: Form is valid:', isValid);
    
    return { ...prev, formData: newFormData, errors: stepErrors, isValid };
  });
}, [validateStep, calculateOverallRating]);
```

## What to Look For

### **When Testing Venue Selection:**

1. **Open browser console** before testing
2. **Select a venue** from the dropdown
3. **Check console logs** for:

#### **Expected Flow:**
```
🎯 Venue selected in EventDetailsStep: { name: "The Factory", id: "...", ... }
🎯 Before update - formData.selectedVenue: null
🎯 Before update - venueLocked: false
🔄 useReviewForm: updateFormData called with: { selectedVenue: { name: "The Factory", ... } }
🔄 useReviewForm: Previous formData: { selectedVenue: null, ... }
🔄 useReviewForm: New formData: { selectedVenue: { name: "The Factory", ... }, ... }
🔄 useReviewForm: Step validation errors: {}
🔄 useReviewForm: Form is valid: true
🎯 After update - setting venueLocked to true
🎯 Venue render check: { hasSelectedVenue: true, venueLocked: true, ... }
```

#### **Potential Issues to Look For:**

1. **Venue selection not called:**
   - Missing `🎯 Venue selected in EventDetailsStep` log
   - Issue in VenueSearchBox component

2. **Form update not called:**
   - Missing `🔄 useReviewForm: updateFormData called with` log
   - Issue in handleVenueSelect function

3. **Form state not updating:**
   - `Previous formData` and `New formData` show same values
   - Issue in useReviewForm state management

4. **Validation still failing:**
   - `Step validation errors` shows `{ selectedVenue: "Please select a venue" }`
   - Issue with validation logic or timing

5. **Render logic issue:**
   - `shouldShowSearch: true` even after selection
   - Issue with venueLocked state or formData.selectedVenue

## Common Causes

### **1. Race Condition**
- Venue selection happens but gets overridden
- Check for multiple `updateFormData` calls

### **2. State Reset**
- Form state gets reset after venue selection
- Look for form resets or component re-renders

### **3. Validation Timing**
- Validation runs before state update completes
- Check timing of validation vs state update

### **4. Component Re-render**
- Component re-renders and loses state
- Check for unnecessary re-renders

## Next Steps

1. **Test the venue selection** with console open
2. **Share the console logs** to identify the exact issue
3. **Based on logs**, implement targeted fix
4. **Remove debug logs** once issue is resolved

## Files Modified

- ✅ `src/components/reviews/ReviewFormSteps/EventDetailsStep.tsx` - Added venue selection debugging
- ✅ `src/hooks/useReviewForm.ts` - Added form state debugging

---

**Status: 🔍 DEBUGGING ADDED - Ready for testing to identify the root cause**
