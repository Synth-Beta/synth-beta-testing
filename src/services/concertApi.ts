// Concert API service for searching and managing concerts
// This will integrate with your backend API when ready

const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:3001';

export interface Concert {
  id: string;
  artist: string;
  date: string;
  venue: string;
  profile_pic?: string;
  tour?: string;
  setlist?: string[];
  venue_location?: string;
  source: string;
  confidence: string;
  created_at: string;
}

export interface SearchParams {
  query?: string;
  artist?: string;
  venue?: string;
  date?: string;
  tour?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  success: boolean;
  concerts: Concert[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ConcertStats {
  totalConcerts: number;
  uniqueArtists: number;
  uniqueVenues: number;
  sourceCounts: Record<string, number>;
}

class ConcertApiService {
  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  async searchConcerts(params: SearchParams): Promise<SearchResponse> {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.append(key, value.toString());
      }
    });

    const queryString = searchParams.toString();
    const endpoint = `/api/concerts/search${queryString ? `?${queryString}` : ''}`;

    return this.makeRequest<SearchResponse>(endpoint);
  }

  async getConcertById(id: string): Promise<{ success: boolean; concert: Concert }> {
    return this.makeRequest<{ success: boolean; concert: Concert }>(`/api/concerts/${id}`);
  }

  async getRecentConcerts(limit: number = 10): Promise<{ success: boolean; concerts: Concert[] }> {
    return this.makeRequest<{ success: boolean; concerts: Concert[] }>(`/api/concerts/recent?limit=${limit}`);
  }

  async getConcertStats(): Promise<{ success: boolean; stats: ConcertStats }> {
    return this.makeRequest<{ success: boolean; stats: ConcertStats }>('/api/concerts/stats');
  }

  // Mock data for development - remove when backend is integrated
  async getMockConcerts(): Promise<Concert[]> {
    return [
      {
        id: '1',
        artist: 'Taylor Swift',
        date: '2024-06-15',
        venue: 'Madison Square Garden',
        profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face',
        tour: 'The Eras Tour',
        setlist: ['Anti-Hero', 'Love Story', 'Shake It Off', 'All Too Well'],
        venue_location: 'New York, NY',
        source: 'jambase_api',
        confidence: 'high',
        created_at: '2024-01-15T10:30:00Z'
      },
      {
        id: '2',
        artist: 'The Weeknd',
        date: '2024-07-22',
        venue: 'SoFi Stadium',
        profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face',
        tour: 'After Hours Til Dawn Tour',
        setlist: ['Blinding Lights', 'Starboy', 'The Hills', 'Save Your Tears'],
        venue_location: 'Inglewood, CA',
        source: 'jambase_api',
        confidence: 'high',
        created_at: '2024-01-20T14:45:00Z'
      },
      {
        id: '3',
        artist: 'Billie Eilish',
        date: '2024-08-10',
        venue: 'Hollywood Bowl',
        profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face',
        tour: 'Happier Than Ever Tour',
        setlist: ['Bad Guy', 'Therefore I Am', 'Happier Than Ever', 'Ocean Eyes'],
        venue_location: 'Los Angeles, CA',
        source: 'manual',
        confidence: 'medium',
        created_at: '2024-01-25T09:15:00Z'
      },
      {
        id: '4',
        artist: 'Harry Styles',
        date: '2024-09-05',
        venue: 'Wembley Stadium',
        profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face',
        tour: 'Love On Tour',
        setlist: ['As It Was', 'Watermelon Sugar', 'Adore You', 'Sign of the Times'],
        venue_location: 'London, UK',
        source: 'jambase_api',
        confidence: 'high',
        created_at: '2024-02-01T16:20:00Z'
      },
      {
        id: '5',
        artist: 'Adele',
        date: '2024-10-12',
        venue: 'Caesars Palace',
        profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face',
        tour: 'Weekends with Adele',
        setlist: ['Hello', 'Someone Like You', 'Rolling in the Deep', 'Easy On Me'],
        venue_location: 'Las Vegas, NV',
        source: 'manual',
        confidence: 'high',
        created_at: '2024-02-05T11:30:00Z'
      }
    ];
  }
}

export const concertApiService = new ConcertApiService();
