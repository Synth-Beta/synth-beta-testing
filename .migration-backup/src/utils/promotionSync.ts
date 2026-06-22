/**
 * Utility functions for syncing promotion metrics
 * Can be called manually to fix inconsistent promotion data
 */

import { PromotionTrackingService } from '@/services/promotionTrackingService';
import { supabase } from '@/integrations/supabase/client';

/**
 * Sync all promotion metrics for a user
 * This can be called to fix inconsistent promotion data
 */
export async function syncAllUserPromotions(userId: string): Promise<void> {
  try {
    console.log('🔄 Syncing all promotion metrics for user:', userId);
    
    // Get all promotions for the user
    const { data: promotions, error } = await supabase
      .from('event_promotions')
      .select('id, event_id')
      .eq('promoted_by_user_id', userId);

    if (error) {
      console.error('Error fetching user promotions:', error);
      return;
    }

    if (!promotions || promotions.length === 0) {
      console.log('No promotions found for user');
      return;
    }

    console.log(`Found ${promotions.length} promotions to sync`);

    // Sync each promotion
    for (const promotion of promotions) {
      try {
        await PromotionTrackingService.syncPromotionMetrics(promotion.id);
        console.log(`✅ Synced promotion ${promotion.id}`);
      } catch (syncError) {
        console.error(`❌ Error syncing promotion ${promotion.id}:`, syncError);
      }
    }

    console.log('🎉 All promotion metrics synced successfully!');
  } catch (error) {
    console.error('Error syncing user promotions:', error);
  }
}

/**
 * Sync all promotion metrics in the system
 * This can be called to fix all inconsistent promotion data
 */
export async function syncAllPromotions(): Promise<void> {
  try {
    console.log('🔄 Syncing all promotion metrics in the system...');
    
    // Get all active promotions
    const { data: promotions, error } = await supabase
      .from('event_promotions')
      .select('id, event_id')
      .eq('promotion_status', 'active');

    if (error) {
      console.error('Error fetching all promotions:', error);
      return;
    }

    if (!promotions || promotions.length === 0) {
      console.log('No active promotions found');
      return;
    }

    console.log(`Found ${promotions.length} active promotions to sync`);

    // Sync each promotion
    for (const promotion of promotions) {
      try {
        await PromotionTrackingService.syncPromotionMetrics(promotion.id);
        console.log(`✅ Synced promotion ${promotion.id}`);
      } catch (syncError) {
        console.error(`❌ Error syncing promotion ${promotion.id}:`, syncError);
      }
    }

    console.log('🎉 All promotion metrics synced successfully!');
  } catch (error) {
    console.error('Error syncing all promotions:', error);
  }
}

export default {
  syncAllUserPromotions,
  syncAllPromotions
};
