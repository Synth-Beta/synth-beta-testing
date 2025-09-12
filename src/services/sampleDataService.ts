import { supabase } from '@/integrations/supabase/client';
import type { Event } from '@/types/concertSearch';

export class SampleDataService {
  // Add sample events to the database for testing
  static async addSampleEvents(): Promise<void> {
    const sampleEvents: Partial<Event>[] = [
      {
        title: 'Taylor Swift - The Eras Tour',
        artist_name: 'Taylor Swift',
        venue_name: 'Madison Square Garden',
        venue_city: 'New York',
        venue_state: 'NY',
        event_date: '2024-12-15T20:00:00Z',
        description: 'The Eras Tour - A journey through all of Taylor Swift\'s musical eras',
        genres: ['Pop', 'Country'],
        ticket_available: true,
        price_range: '$150 - $500',
        jambase_event_id: 'sample-1'
      },
      {
        title: 'The Weeknd - After Hours Til Dawn Tour',
        artist_name: 'The Weeknd',
        venue_name: 'SoFi Stadium',
        venue_city: 'Inglewood',
        venue_state: 'CA',
        event_date: '2024-12-20T19:30:00Z',
        description: 'The Weeknd brings his After Hours Til Dawn Tour to SoFi Stadium',
        genres: ['R&B', 'Pop'],
        ticket_available: true,
        price_range: '$100 - $300',
        jambase_event_id: 'sample-2'
      },
      {
        title: 'Billie Eilish - Happier Than Ever Tour',
        artist_name: 'Billie Eilish',
        venue_name: 'Hollywood Bowl',
        venue_city: 'Los Angeles',
        venue_state: 'CA',
        event_date: '2024-12-25T20:00:00Z',
        description: 'Billie Eilish performs hits from Happier Than Ever',
        genres: ['Pop', 'Alternative'],
        ticket_available: false,
        price_range: '$80 - $250',
        jambase_event_id: 'sample-3'
      },
      {
        title: 'Drake - It\'s All A Blur Tour',
        artist_name: 'Drake',
        venue_name: 'United Center',
        venue_city: 'Chicago',
        venue_state: 'IL',
        event_date: '2024-12-30T20:00:00Z',
        description: 'Drake brings his It\'s All A Blur Tour to Chicago',
        genres: ['Hip-Hop', 'R&B'],
        ticket_available: true,
        price_range: '$120 - $400',
        jambase_event_id: 'sample-4'
      },
      {
        title: 'Ariana Grande - Sweetener World Tour',
        artist_name: 'Ariana Grande',
        venue_name: 'Radio City Music Hall',
        venue_city: 'New York',
        venue_state: 'NY',
        event_date: '2025-01-05T20:00:00Z',
        description: 'Ariana Grande performs songs from Sweetener and Thank U, Next',
        genres: ['Pop', 'R&B'],
        ticket_available: true,
        price_range: '$90 - $350',
        jambase_event_id: 'sample-5'
      }
    ];

    try {
      const { error } = await supabase
        .from('jambase_events')
        .insert(sampleEvents);

      if (error) {
        console.error('Error adding sample events:', error);
        throw error;
      }

      console.log('Sample events added successfully!');
    } catch (error) {
      console.error('Failed to add sample events:', error);
      throw error;
    }
  }

  // Clear all events from the database
  static async clearAllEvents(): Promise<void> {
    try {
      const { error } = await supabase
        .from('jambase_events')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records

      if (error) {
        console.error('Error clearing events:', error);
        throw error;
      }

      console.log('All events cleared successfully!');
    } catch (error) {
      console.error('Failed to clear events:', error);
      throw error;
    }
  }

  // Get event count
  static async getEventCount(): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('jambase_events')
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.error('Error getting event count:', error);
        throw error;
      }

      return count || 0;
    } catch (error) {
      console.error('Failed to get event count:', error);
      return 0;
    }
  }
}
