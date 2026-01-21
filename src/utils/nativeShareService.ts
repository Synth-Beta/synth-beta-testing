/**
 * Service for triggering native iOS share modal
 */

export interface EventShareData {
  eventId: string;
  title: string;
  artistName?: string;
  venueName?: string;
  venueCity?: string;
  eventDate?: string;
  imageUrl?: string;
  posterImageUrl?: string;
}

/**
 * Triggers native iOS share modal via WebKit message handler or CustomEvent
 */
export function triggerNativeEventShare(event: EventShareData): void {
  // Primary method: Post message via WebKit message handler (direct native communication)
  if ((window as any).webkit?.messageHandlers?.eventShare) {
    try {
      (window as any).webkit.messageHandlers.eventShare.postMessage({
        eventId: event.eventId,
        title: event.title,
        artistName: event.artistName,
        venueName: event.venueName,
        venueCity: event.venueCity,
        eventDate: event.eventDate,
        imageUrl: event.imageUrl,
        posterImageUrl: event.posterImageUrl,
      });
      return; // Successfully sent via message handler
    } catch (error) {
      console.warn('Failed to post via WebKit message handler:', error);
    }
  }
  
  // Fallback: Dispatch CustomEvent (JavaScript will forward it to native via injected script)
  window.dispatchEvent(new CustomEvent('RequestEventShare', {
    detail: {
      eventId: event.eventId,
      title: event.title,
      artistName: event.artistName,
      venueName: event.venueName,
      venueCity: event.venueCity,
      eventDate: event.eventDate,
      imageUrl: event.imageUrl,
      posterImageUrl: event.posterImageUrl,
    }
  }));
}

/**
 * Checks if native share is available (iOS app)
 */
export function isNativeShareAvailable(): boolean {
  return !!(window as any).webkit?.messageHandlers?.eventShare;
}

/**
 * Listens for share in chat callback from native layer
 */
export function setupNativeShareListener(
  onShareInChat: (event: EventShareData) => void
): () => void {
  const handler = (event: CustomEvent) => {
    const detail = event.detail || (event as any).detail;
    if (detail?.action === 'shareInChat' && detail?.event) {
      onShareInChat(detail.event);
    }
  };
  
  window.addEventListener('NativeShareEvent', handler as EventListener);
  
  // Return cleanup function
  return () => {
    window.removeEventListener('NativeShareEvent', handler as EventListener);
  };
}
