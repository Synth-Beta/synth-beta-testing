import { useEffect, useRef, useCallback } from 'react';
import { DraftReviewService, DraftReviewData } from '@/services/draftReviewService';

interface UseAutoSaveOptions {
  userId: string;
  eventId: string;
  formData: DraftReviewData;
  enabled?: boolean;
  debounceMs?: number;
  onSave?: (success: boolean) => void;
  requireEventSelection?: boolean;
}

export function useAutoSave({
  userId,
  eventId,
  formData,
  enabled = true,
  debounceMs = 2000,
  onSave,
  requireEventSelection = true
}: UseAutoSaveOptions) {
  const timeoutRef = useRef<NodeJS.Timeout>();
  const lastSavedDataRef = useRef<string>('');

  const saveDraft = useCallback(async (data: DraftReviewData) => {
    if (!enabled || !userId) {
      console.log('🚫 Auto-save skipped:', { enabled, userId: !!userId });
      return;
    }

    try {
      // Save to localStorage instead of database to prevent creating review records
      const storageKey = `review_draft_${userId}_${eventId || 'new'}`;
      localStorage.setItem(storageKey, JSON.stringify({
        data,
        timestamp: Date.now(),
        eventId: eventId || null
      }));
      
      console.log('💾 Auto-saved to localStorage:', storageKey);
      onSave?.(true);
      lastSavedDataRef.current = JSON.stringify(data);
    } catch (error) {
      console.error('Auto-save to localStorage failed:', error);
      onSave?.(false);
    }
  }, [userId, eventId, enabled, onSave]);

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
    if (!enabled || !userId || !eventId) return;

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
  }, [formData, debouncedSave, enabled, userId, eventId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Manual save function
  const manualSave = useCallback(async () => {
    console.log('💾 Manual save triggered:', { userId, eventId, hasFormData: !!formData });
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    await saveDraft(formData);
  }, [saveDraft, formData, userId, eventId]);

  // Load draft from localStorage
  const loadDraft = useCallback((eventId?: string) => {
    try {
      const storageKey = `review_draft_${userId}_${eventId || 'new'}`;
      const stored = localStorage.getItem(storageKey);
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
      const storageKey = `review_draft_${userId}_${eventId || 'new'}`;
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
