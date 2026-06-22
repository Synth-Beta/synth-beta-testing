import { supabase } from '@/integrations/supabase/client';

export interface EmailNotification {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export class EmailService {
  static async sendFriendRequestNotification(
    receiverEmail: string,
    senderName: string,
    receiverName: string
  ): Promise<void> {
    const subject = `${senderName} wants to connect with you!`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🎵 PlusOne Event Crew</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">New Friend Request!</h2>
          
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            Hi ${receiverName},
          </p>
          
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            <strong>${senderName}</strong> wants to connect with you on PlusOne Event Crew! 
            They're interested in finding concert buddies and sharing their music experiences.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
            <p style="margin: 0; color: #333; font-weight: 500;">
              "Let's discover amazing concerts together and share our love for music!"
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${window.location.origin}" 
               style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                      color: white; 
                      padding: 12px 30px; 
                      text-decoration: none; 
                      border-radius: 25px; 
                      font-weight: 600; 
                      display: inline-block;">
              View Friend Request
            </a>
          </div>
          
          <p style="color: #999; font-size: 14px; margin-top: 30px;">
            This notification was sent because someone wants to connect with you on PlusOne Event Crew. 
            You can manage your notification preferences in your account settings.
          </p>
        </div>
      </div>
    `;
    
    const text = `
      Hi ${receiverName},
      
      ${senderName} wants to connect with you on PlusOne Event Crew!
      
      They're interested in finding concert buddies and sharing their music experiences.
      
      Visit ${window.location.origin} to view and respond to the friend request.
      
      Best regards,
      The PlusOne Event Crew Team
    `;

    await this.sendEmail({
      to: receiverEmail,
      subject,
      html,
      text
    });
  }

  static async sendFriendAcceptedNotification(
    senderEmail: string,
    receiverName: string,
    senderName: string
  ): Promise<void> {
    const subject = `${receiverName} accepted your friend request!`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🎵 PlusOne Event Crew</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">🎉 Friend Request Accepted!</h2>
          
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            Great news, ${senderName}!
          </p>
          
          <p style="color: #666; font-size: 16px; line-height: 1.6;">
            <strong>${receiverName}</strong> has accepted your friend request! 
            You're now connected and can start discovering concerts together.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
            <p style="margin: 0; color: #333; font-weight: 500;">
              "You're now friends! Start exploring concerts and sharing your music experiences."
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${window.location.origin}" 
               style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
                      color: white; 
                      padding: 12px 30px; 
                      text-decoration: none; 
                      border-radius: 25px; 
                      font-weight: 600; 
                      display: inline-block;">
              Start Exploring Together
            </a>
          </div>
        </div>
      </div>
    `;
    
    const text = `
      Great news, ${senderName}!
      
      ${receiverName} has accepted your friend request! 
      You're now connected and can start discovering concerts together.
      
      Visit ${window.location.origin} to start exploring concerts with your new friend.
      
      Best regards,
      The PlusOne Event Crew Team
    `;

    await this.sendEmail({
      to: senderEmail,
      subject,
      html,
      text
    });
  }

  private static async sendEmail(emailData: EmailNotification): Promise<void> {
    try {
      // For now, we'll use Supabase Edge Functions to send emails
      // You'll need to set up a Supabase Edge Function for email sending
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: emailData
      });

      if (error) {
        console.error('Error sending email:', error);
        throw error;
      }

      console.log('Email sent successfully:', data);
    } catch (error) {
      console.error('Failed to send email:', error);
      // Don't throw error to prevent breaking the main flow
      // Email sending is not critical for the core functionality
    }
  }
}
