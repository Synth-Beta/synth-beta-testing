import { useEffect, useRef, useCallback } from 'react';
import { DraftReviewService, DraftReviewData } from '@/services/draftReviewService';

interface UseAutoSaveOptions {
  userId: string;
  eventId: string | null | undefined;
  formData: DraftReviewData;
  enabled?: boolean;
  debounceMs?: number;
  onSave?: (success: boolean) => void;
  onEventIdChange?: (eventId: string) => void;
}

export function useAutoSave({
  userId,
  eventId,
  formData,
  enabled = true,
  debounceMs = 2000,
  onSave,
  onEventIdChange
}: UseAutoSaveOptions) {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastSavedDataRef = useRef<string>('');
  const isSavingRef = useRef<boolean>(false);

  // Helper to validate UUID
  const isValidUUID = useCallback((value: string | null | undefined): boolean => {
    if (!value) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }, []);

  const saveDraft = useCallback(async (data: DraftReviewData, targetEventId?: string) => {
    if (!enabled || !userId) {
      console.log('🚫 Auto-save skipped:', { enabled, userId: !!userId });
      return;
    }

    const effectiveEventId = targetEventId || eventId;
    
    // If no valid event ID yet, we can't save to database - save to localStorage as fallback
    if (!effectiveEventId || !isValidUUID(effectiveEventId)) {
      console.log('💾 Auto-save: No valid event ID yet, saving to localStorage as fallback');
      try {
        // Use the best available identifier for the storage key:
        // 1) targetEventId if provided
        // 2) eventId from hook props
        // 3) "new" as a final fallback
        const storageEventId = targetEventId ?? eventId ?? 'new';
        const storageKey = `review_draft_${userId}_${storageEventId}`;
        localStorage.setItem(storageKey, JSON.stringify({
          data,
          timestamp: Date.now(),
          eventId: effectiveEventId ?? null
        }));
        onSave?.(true);
        lastSavedDataRef.current = JSON.stringify(data);
      } catch (error) {
        console.error('Auto-save to localStorage failed:', error);
        onSave?.(false);
      }
      return;
    }

    // Validate UUID format
    if (!isValidUUID(effectiveEventId)) {
      console.log('🚫 Auto-save skipped: Invalid event ID format:', effectiveEventId);
      return;
    }

    // Prevent concurrent saves
    if (isSavingRef.current) {
      console.log('⏳ Auto-save: Already saving, skipping...');
      return;
    }

    try {
      isSavingRef.current = true;
      console.log('💾 Auto-saving draft to database:', { userId, eventId: effectiveEventId });
      
      const draftId = await DraftReviewService.saveDraft(userId, effectiveEventId, data);
      
      if (draftId) {
        console.log('✅ Auto-saved draft successfully:', draftId);
        onSave?.(true);
        lastSavedDataRef.current = JSON.stringify(data);
      } else {
        console.warn('⚠️ Auto-save returned null (may be expected)');
        onSave?.(false);
      }
    } catch (error) {
      console.error('❌ Auto-save to database failed:', error);
      onSave?.(false);
    } finally {
      isSavingRef.current = false;
    }
  }, [userId, eventId, enabled, onSave, isValidUUID]);

  const debouncedSave = useCallback((data: DraftReviewData) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      saveDraft(data);
    }, debounceMs);
  }, [saveDraft, debounceMs]);

  // Auto-save when form data changes
  useEffect(() => {
    if (!enabled || !userId) return;

    const currentDataString = JSON.stringify(formData);
    
    // Only save if data has actually changed
    if (currentDataString !== lastSavedDataRef.current) {
      // Check if there's any meaningful data to save
      const hasData = Object.values(formData).some(value => {
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'object' && value !== null) return Object.keys(value).length > 0;
        return value !== undefined && value !== null && value !== '';
      });

      if (hasData) {
        debouncedSave(formData);
      }
    }
  }, [formData, debouncedSave, enabled, userId]);

  // Auto-save when eventId becomes available (if it was null before)
  useEffect(() => {
    if (!enabled || !userId || !eventId) return;
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) return;

    // If we have form data and a valid event ID, save immediately
    const hasData = Object.values(formData).some(value => {
      if (Array.isArray(value)) return value.length > 0;
      if (typeof value === 'object' && value !== null) return Object.keys(value).length > 0;
      return value !== undefined && value !== null && value !== '';
    });

    if (hasData) {
      console.log('💾 Event ID available, saving draft immediately');
      // Clear any pending debounced save and save immediately
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      saveDraft(formData, eventId);
      onEventIdChange?.(eventId);
    }
  }, [eventId, enabled, userId, formData, saveDraft, onEventIdChange]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Manual save function (for immediate save if needed)
  const manualSave = useCallback(async () => {
    console.log('💾 Manual save triggered:', { userId, eventId, hasFormData: !!formData });
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    await saveDraft(formData, eventId || undefined);
  }, [saveDraft, formData, userId, eventId]);

  // Load draft from localStorage
  const loadDraft = useCallback((eventId?: string) => {
    try {
      // Use the same key selection logic as saveDraft's localStorage fallback:
      // prefer the provided eventId, otherwise fall back to "new".
      const storageEventId = eventId ?? 'new';
      const storageKey = `review_draft_${userId}_${storageEventId}`;
      let stored = localStorage.getItem(storageKey);

      // Backwards compatibility: also check legacy "new" key if nothing found
      if (!stored && storageEventId !== 'new') {
        const legacyKey = `review_draft_${userId}_new`;
        stored = localStorage.getItem(legacyKey);
        if (stored) {
          console.log('📂 Loaded draft from legacy localStorage key:', legacyKey);
        }
      }

      if (stored) {
        const parsed = JSON.parse(stored);
        console.log('📂 Loaded draft from localStorage:', storageKey);
        return parsed.data;
      }
    } catch (error) {
      console.error('Error loading draft from localStorage:', error);
    }
    return null;
  }, [userId]);

  // Clear draft from localStorage
  const clearDraft = useCallback((eventId?: string) => {
    try {
      const storageEventId = eventId ?? 'new';
      const storageKey = `review_draft_${userId}_${storageEventId}`;
      localStorage.removeItem(storageKey);
      console.log('🗑️ Cleared draft from localStorage:', storageKey);
    } catch (error) {
      console.error('Error clearing draft from localStorage:', error);
    }
  }, [userId]);

  return {
    manualSave,
    loadDraft,
    clearDraft
  };
}
