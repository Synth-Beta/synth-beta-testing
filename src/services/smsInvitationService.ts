import { supabase } from '@/integrations/supabase/client';

export class SMSInvitationService {
  /**
   * Send SMS invitations to phone numbers for a review
   * @param phoneNumbers Array of phone numbers to send invitations to
   * @param reviewId ID of the review
   * @param senderName Name of the person who tagged them
   */
  static async sendReviewInvitations(
    phoneNumbers: string[],
    reviewId: string,
    senderName: string
  ): Promise<void> {
    try {
      console.log('📱 Sending SMS invitations:', { phoneNumbers, reviewId, senderName });

      // Call Supabase Edge Function or external SMS API
      // This is a placeholder - you'll need to configure the actual SMS provider
      const { error } = await supabase.functions.invoke('send-review-invitations', {
        body: {
          phoneNumbers,
          reviewId,
          senderName,
          message: `${senderName} tagged you in a concert review on Synth! Check it out: https://synth.app/reviews/${reviewId}`
        }
      });

      if (error) {
        console.error('Error invoking SMS function:', error);
        // Don't throw - SMS is non-critical
      } else {
        console.log('✅ SMS invitations sent successfully');
      }
    } catch (error) {
      console.error('Failed to send SMS invitations:', error);
      // Don't throw - SMS is non-critical for review submission
    }
  }

  /**
   * Validate phone number format (E.164 international format)
   */
  static validatePhoneNumber(phone: string): boolean {
    // E.164 format: +[country code][number] (max 15 digits after +)
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    return e164Regex.test(phone);
  }

  /**
   * Format phone number to E.164 format
   */
  static formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters except +
    const cleaned = phone.replace(/[^\d+]/g, '');
    
    // If it doesn't start with +, add it
    if (!cleaned.startsWith('+')) {
      return `+${cleaned}`;
    }
    
    return cleaned;
  }
}
