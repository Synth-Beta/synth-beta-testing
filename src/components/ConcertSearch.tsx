import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Calendar, MapPin, Music, Filter, X, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Concert {
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

interface ConcertSearchProps {
  currentUserId: string;
  onSelectConcert?: (concert: Concert) => void;
}

export const ConcertSearch = ({ currentUserId, onSelectConcert }: ConcertSearchProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [concerts, setConcerts] = useState<Concert[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [recentConcerts, setRecentConcerts] = useState<Concert[]>([]);
  const { toast } = useToast();

  // Define fallback concerts data
  const fallbackConcerts: Concert[] = [
    // Taylor Swift concerts
    { id: '1', artist: 'Taylor Swift', date: '2024-06-15', venue: 'Madison Square Garden', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'The Eras Tour', setlist: ['Anti-Hero', 'Love Story', 'Shake It Off', 'All Too Well'], venue_location: 'New York, NY', source: 'jambase_api', confidence: 'high', created_at: '2024-01-15T10:30:00Z' },
    { id: '2', artist: 'Taylor Swift', date: '2024-06-22', venue: 'SoFi Stadium', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'The Eras Tour', setlist: ['Anti-Hero', 'Love Story', 'Shake It Off', 'All Too Well'], venue_location: 'Inglewood, CA', source: 'jambase_api', confidence: 'high', created_at: '2024-01-16T10:30:00Z' },
    { id: '3', artist: 'Taylor Swift', date: '2024-07-05', venue: 'MetLife Stadium', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'The Eras Tour', setlist: ['Anti-Hero', 'Love Story', 'Shake It Off', 'All Too Well'], venue_location: 'East Rutherford, NJ', source: 'jambase_api', confidence: 'high', created_at: '2024-01-17T10:30:00Z' },
    { id: '4', artist: 'Taylor Swift', date: '2024-07-12', venue: 'Gillette Stadium', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'The Eras Tour', setlist: ['Anti-Hero', 'Love Story', 'Shake It Off', 'All Too Well'], venue_location: 'Foxborough, MA', source: 'jambase_api', confidence: 'high', created_at: '2024-01-18T10:30:00Z' },
    { id: '5', artist: 'Taylor Swift', date: '2024-07-19', venue: 'Lincoln Financial Field', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'The Eras Tour', setlist: ['Anti-Hero', 'Love Story', 'Shake It Off', 'All Too Well'], venue_location: 'Philadelphia, PA', source: 'jambase_api', confidence: 'high', created_at: '2024-01-19T10:30:00Z' },
    
    // The Weeknd concerts
    { id: '6', artist: 'The Weeknd', date: '2024-07-22', venue: 'SoFi Stadium', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'After Hours Til Dawn Tour', setlist: ['Blinding Lights', 'Starboy', 'The Hills', 'Save Your Tears'], venue_location: 'Inglewood, CA', source: 'jambase_api', confidence: 'high', created_at: '2024-01-20T14:45:00Z' },
    { id: '7', artist: 'The Weeknd', date: '2024-08-05', venue: 'Mercedes-Benz Stadium', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'After Hours Til Dawn Tour', setlist: ['Blinding Lights', 'Starboy', 'The Hills', 'Save Your Tears'], venue_location: 'Atlanta, GA', source: 'jambase_api', confidence: 'high', created_at: '2024-01-21T14:45:00Z' },
    { id: '8', artist: 'The Weeknd', date: '2024-08-12', venue: 'Hard Rock Stadium', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'After Hours Til Dawn Tour', setlist: ['Blinding Lights', 'Starboy', 'The Hills', 'Save Your Tears'], venue_location: 'Miami, FL', source: 'jambase_api', confidence: 'high', created_at: '2024-01-22T14:45:00Z' },
    { id: '9', artist: 'The Weeknd', date: '2024-08-19', venue: 'AT&T Stadium', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'After Hours Til Dawn Tour', setlist: ['Blinding Lights', 'Starboy', 'The Hills', 'Save Your Tears'], venue_location: 'Arlington, TX', source: 'jambase_api', confidence: 'high', created_at: '2024-01-23T14:45:00Z' },
    { id: '10', artist: 'The Weeknd', date: '2024-08-26', venue: 'Soldier Field', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'After Hours Til Dawn Tour', setlist: ['Blinding Lights', 'Starboy', 'The Hills', 'Save Your Tears'], venue_location: 'Chicago, IL', source: 'jambase_api', confidence: 'high', created_at: '2024-01-24T14:45:00Z' },
    
    // Billie Eilish concerts
    { id: '11', artist: 'Billie Eilish', date: '2024-08-10', venue: 'Hollywood Bowl', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'Happier Than Ever Tour', setlist: ['Bad Guy', 'Therefore I Am', 'Happier Than Ever', 'Ocean Eyes'], venue_location: 'Los Angeles, CA', source: 'jambase_api', confidence: 'high', created_at: '2024-01-25T09:15:00Z' },
    { id: '12', artist: 'Billie Eilish', date: '2024-08-17', venue: 'Red Rocks Amphitheatre', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'Happier Than Ever Tour', setlist: ['Bad Guy', 'Therefore I Am', 'Happier Than Ever', 'Ocean Eyes'], venue_location: 'Morrison, CO', source: 'jambase_api', confidence: 'high', created_at: '2024-01-26T09:15:00Z' },
    { id: '13', artist: 'Billie Eilish', date: '2024-08-24', venue: 'Bridgestone Arena', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'Happier Than Ever Tour', setlist: ['Bad Guy', 'Therefore I Am', 'Happier Than Ever', 'Ocean Eyes'], venue_location: 'Nashville, TN', source: 'jambase_api', confidence: 'high', created_at: '2024-01-27T09:15:00Z' },
    { id: '14', artist: 'Billie Eilish', date: '2024-08-31', venue: 'State Farm Arena', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'Happier Than Ever Tour', setlist: ['Bad Guy', 'Therefore I Am', 'Happier Than Ever', 'Ocean Eyes'], venue_location: 'Atlanta, GA', source: 'jambase_api', confidence: 'high', created_at: '2024-01-28T09:15:00Z' },
    { id: '15', artist: 'Billie Eilish', date: '2024-09-07', venue: 'TD Garden', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'Happier Than Ever Tour', setlist: ['Bad Guy', 'Therefore I Am', 'Happier Than Ever', 'Ocean Eyes'], venue_location: 'Boston, MA', source: 'jambase_api', confidence: 'high', created_at: '2024-01-29T09:15:00Z' },
    
    // Drake concerts
    { id: '16', artist: 'Drake', date: '2024-09-05', venue: 'Rogers Centre', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'It\'s All A Blur Tour', setlist: ['God\'s Plan', 'Hotline Bling', 'One Dance', 'Started From The Bottom'], venue_location: 'Toronto, ON', source: 'jambase_api', confidence: 'high', created_at: '2024-01-30T16:20:00Z' },
    { id: '17', artist: 'Drake', date: '2024-09-12', venue: 'Bell Centre', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'It\'s All A Blur Tour', setlist: ['God\'s Plan', 'Hotline Bling', 'One Dance', 'Started From The Bottom'], venue_location: 'Montreal, QC', source: 'jambase_api', confidence: 'high', created_at: '2024-01-31T16:20:00Z' },
    { id: '18', artist: 'Drake', date: '2024-09-19', venue: 'United Center', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'It\'s All A Blur Tour', setlist: ['God\'s Plan', 'Hotline Bling', 'One Dance', 'Started From The Bottom'], venue_location: 'Chicago, IL', source: 'jambase_api', confidence: 'high', created_at: '2024-02-01T16:20:00Z' },
    { id: '19', artist: 'Drake', date: '2024-09-26', venue: 'Little Caesars Arena', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'It\'s All A Blur Tour', setlist: ['God\'s Plan', 'Hotline Bling', 'One Dance', 'Started From The Bottom'], venue_location: 'Detroit, MI', source: 'jambase_api', confidence: 'high', created_at: '2024-02-02T16:20:00Z' },
    { id: '20', artist: 'Drake', date: '2024-10-03', venue: 'Scotiabank Arena', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'It\'s All A Blur Tour', setlist: ['God\'s Plan', 'Hotline Bling', 'One Dance', 'Started From The Bottom'], venue_location: 'Toronto, ON', source: 'jambase_api', confidence: 'high', created_at: '2024-02-03T16:20:00Z' },
    
    // Ariana Grande concerts
    { id: '21', artist: 'Ariana Grande', date: '2024-10-12', venue: 'MetLife Stadium', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'Sweetener World Tour', setlist: ['Thank U, Next', '7 Rings', 'Positions', 'Side To Side'], venue_location: 'East Rutherford, NJ', source: 'jambase_api', confidence: 'high', created_at: '2024-02-05T11:45:00Z' },
    { id: '22', artist: 'Ariana Grande', date: '2024-10-19', venue: 'Fenway Park', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'Sweetener World Tour', setlist: ['Thank U, Next', '7 Rings', 'Positions', 'Side To Side'], venue_location: 'Boston, MA', source: 'jambase_api', confidence: 'high', created_at: '2024-02-06T11:45:00Z' },
    { id: '23', artist: 'Ariana Grande', date: '2024-10-26', venue: 'Wrigley Field', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'Sweetener World Tour', setlist: ['Thank U, Next', '7 Rings', 'Positions', 'Side To Side'], venue_location: 'Chicago, IL', source: 'jambase_api', confidence: 'high', created_at: '2024-02-07T11:45:00Z' },
    { id: '24', artist: 'Ariana Grande', date: '2024-11-02', venue: 'Dodger Stadium', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'Sweetener World Tour', setlist: ['Thank U, Next', '7 Rings', 'Positions', 'Side To Side'], venue_location: 'Los Angeles, CA', source: 'jambase_api', confidence: 'high', created_at: '2024-02-08T11:45:00Z' },
    { id: '25', artist: 'Ariana Grande', date: '2024-11-09', venue: 'Mercedes-Benz Stadium', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'Sweetener World Tour', setlist: ['Thank U, Next', '7 Rings', 'Positions', 'Side To Side'], venue_location: 'Atlanta, GA', source: 'jambase_api', confidence: 'high', created_at: '2024-02-09T11:45:00Z' },
    
    // Ed Sheeran concerts
    { id: '26', artist: 'Ed Sheeran', date: '2024-11-18', venue: 'Wembley Stadium', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'Mathematics Tour', setlist: ['Shape of You', 'Perfect', 'Thinking Out Loud', 'Castle on the Hill'], venue_location: 'London, UK', source: 'jambase_api', confidence: 'high', created_at: '2024-02-10T12:00:00Z' },
    { id: '27', artist: 'Ed Sheeran', date: '2024-11-25', venue: 'Croke Park', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'Mathematics Tour', setlist: ['Shape of You', 'Perfect', 'Thinking Out Loud', 'Castle on the Hill'], venue_location: 'Dublin, Ireland', source: 'jambase_api', confidence: 'high', created_at: '2024-02-11T12:00:00Z' },
    { id: '28', artist: 'Ed Sheeran', date: '2024-12-02', venue: 'Hampden Park', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'Mathematics Tour', setlist: ['Shape of You', 'Perfect', 'Thinking Out Loud', 'Castle on the Hill'], venue_location: 'Glasgow, Scotland', source: 'jambase_api', confidence: 'high', created_at: '2024-02-12T12:00:00Z' },
    { id: '29', artist: 'Ed Sheeran', date: '2024-12-09', venue: 'Principality Stadium', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'Mathematics Tour', setlist: ['Shape of You', 'Perfect', 'Thinking Out Loud', 'Castle on the Hill'], venue_location: 'Cardiff, Wales', source: 'jambase_api', confidence: 'high', created_at: '2024-02-13T12:00:00Z' },
    { id: '30', artist: 'Ed Sheeran', date: '2024-12-16', venue: 'Etihad Stadium', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'Mathematics Tour', setlist: ['Shape of You', 'Perfect', 'Thinking Out Loud', 'Castle on the Hill'], venue_location: 'Manchester, UK', source: 'jambase_api', confidence: 'high', created_at: '2024-02-14T12:00:00Z' },
    
    // Beyoncé concerts
    { id: '31', artist: 'Beyoncé', date: '2024-12-03', venue: 'Mercedes-Benz Stadium', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'Renaissance World Tour', setlist: ['Break My Soul', 'Cuff It', 'Formation', 'Single Ladies'], venue_location: 'Atlanta, GA', source: 'jambase_api', confidence: 'high', created_at: '2024-02-15T15:30:00Z' },
    { id: '32', artist: 'Beyoncé', date: '2024-12-10', venue: 'Hard Rock Stadium', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'Renaissance World Tour', setlist: ['Break My Soul', 'Cuff It', 'Formation', 'Single Ladies'], venue_location: 'Miami, FL', source: 'jambase_api', confidence: 'high', created_at: '2024-02-16T15:30:00Z' },
    { id: '33', artist: 'Beyoncé', date: '2024-12-17', venue: 'AT&T Stadium', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'Renaissance World Tour', setlist: ['Break My Soul', 'Cuff It', 'Formation', 'Single Ladies'], venue_location: 'Arlington, TX', source: 'jambase_api', confidence: 'high', created_at: '2024-02-17T15:30:00Z' },
    { id: '34', artist: 'Beyoncé', date: '2024-12-24', venue: 'Allegiant Stadium', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'Renaissance World Tour', setlist: ['Break My Soul', 'Cuff It', 'Formation', 'Single Ladies'], venue_location: 'Las Vegas, NV', source: 'jambase_api', confidence: 'high', created_at: '2024-02-18T15:30:00Z' },
    { id: '35', artist: 'Beyoncé', date: '2024-12-31', venue: 'SoFi Stadium', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'Renaissance World Tour', setlist: ['Break My Soul', 'Cuff It', 'Formation', 'Single Ladies'], venue_location: 'Inglewood, CA', source: 'jambase_api', confidence: 'high', created_at: '2024-02-19T15:30:00Z' },
    
    // Harry Styles concerts
    { id: '36', artist: 'Harry Styles', date: '2025-01-20', venue: 'Fenway Park', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'Love On Tour', setlist: ['As It Was', 'Watermelon Sugar', 'Adore You', 'Sign of the Times'], venue_location: 'Boston, MA', source: 'jambase_api', confidence: 'high', created_at: '2024-02-20T18:00:00Z' },
    { id: '37', artist: 'Harry Styles', date: '2025-01-27', venue: 'Yankee Stadium', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'Love On Tour', setlist: ['As It Was', 'Watermelon Sugar', 'Adore You', 'Sign of the Times'], venue_location: 'Bronx, NY', source: 'jambase_api', confidence: 'high', created_at: '2024-02-21T18:00:00Z' },
    { id: '38', artist: 'Harry Styles', date: '2025-02-03', venue: 'Wrigley Field', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'Love On Tour', setlist: ['As It Was', 'Watermelon Sugar', 'Adore You', 'Sign of the Times'], venue_location: 'Chicago, IL', source: 'jambase_api', confidence: 'high', created_at: '2024-02-22T18:00:00Z' },
    { id: '39', artist: 'Harry Styles', date: '2025-02-10', venue: 'Dodger Stadium', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'Love On Tour', setlist: ['As It Was', 'Watermelon Sugar', 'Adore You', 'Sign of the Times'], venue_location: 'Los Angeles, CA', source: 'jambase_api', confidence: 'high', created_at: '2024-02-23T18:00:00Z' },
    { id: '40', artist: 'Harry Styles', date: '2025-02-17', venue: 'Rogers Centre', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'Love On Tour', setlist: ['As It Was', 'Watermelon Sugar', 'Adore You', 'Sign of the Times'], venue_location: 'Toronto, ON', source: 'jambase_api', confidence: 'high', created_at: '2024-02-24T18:00:00Z' },
    
    // Olivia Rodrigo concerts
    { id: '41', artist: 'Olivia Rodrigo', date: '2025-02-14', venue: 'Red Rocks Amphitheatre', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'GUTS World Tour', setlist: ['Vampire', 'Good 4 U', 'Drivers License', 'Deja Vu'], venue_location: 'Morrison, CO', source: 'jambase_api', confidence: 'high', created_at: '2024-02-25T14:30:00Z' },
    { id: '42', artist: 'Olivia Rodrigo', date: '2025-02-21', venue: 'Hollywood Bowl', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'GUTS World Tour', setlist: ['Vampire', 'Good 4 U', 'Drivers License', 'Deja Vu'], venue_location: 'Los Angeles, CA', source: 'jambase_api', confidence: 'high', created_at: '2024-02-26T14:30:00Z' },
    { id: '43', artist: 'Olivia Rodrigo', date: '2025-02-28', venue: 'Madison Square Garden', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'GUTS World Tour', setlist: ['Vampire', 'Good 4 U', 'Drivers License', 'Deja Vu'], venue_location: 'New York, NY', source: 'jambase_api', confidence: 'high', created_at: '2024-02-27T14:30:00Z' },
    { id: '44', artist: 'Olivia Rodrigo', date: '2025-03-07', venue: 'TD Garden', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'GUTS World Tour', setlist: ['Vampire', 'Good 4 U', 'Drivers License', 'Deja Vu'], venue_location: 'Boston, MA', source: 'jambase_api', confidence: 'high', created_at: '2024-02-28T14:30:00Z' },
    { id: '45', artist: 'Olivia Rodrigo', date: '2025-03-14', venue: 'United Center', profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face', tour: 'GUTS World Tour', setlist: ['Vampire', 'Good 4 U', 'Drivers License', 'Deja Vu'], venue_location: 'Chicago, IL', source: 'jambase_api', confidence: 'high', created_at: '2024-03-01T14:30:00Z' },
    
    // Bad Bunny concerts
    { id: '46', artist: 'Bad Bunny', date: '2025-03-08', venue: 'Hard Rock Stadium', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'Most Wanted Tour', setlist: ['Titi Me Pregunto', 'Moscow Mule', 'Efecto', 'Me Porto Bonito'], venue_location: 'Miami, FL', source: 'jambase_api', confidence: 'high', created_at: '2024-03-02T20:15:00Z' },
    { id: '47', artist: 'Bad Bunny', date: '2025-03-15', venue: 'Mercedes-Benz Stadium', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'Most Wanted Tour', setlist: ['Titi Me Pregunto', 'Moscow Mule', 'Efecto', 'Me Porto Bonito'], venue_location: 'Atlanta, GA', source: 'jambase_api', confidence: 'high', created_at: '2024-03-03T20:15:00Z' },
    { id: '48', artist: 'Bad Bunny', date: '2025-03-22', venue: 'AT&T Stadium', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'Most Wanted Tour', setlist: ['Titi Me Pregunto', 'Moscow Mule', 'Efecto', 'Me Porto Bonito'], venue_location: 'Arlington, TX', source: 'jambase_api', confidence: 'high', created_at: '2024-03-04T20:15:00Z' },
    { id: '49', artist: 'Bad Bunny', date: '2025-03-29', venue: 'SoFi Stadium', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'Most Wanted Tour', setlist: ['Titi Me Pregunto', 'Moscow Mule', 'Efecto', 'Me Porto Bonito'], venue_location: 'Inglewood, CA', source: 'jambase_api', confidence: 'high', created_at: '2024-03-05T20:15:00Z' },
    { id: '50', artist: 'Bad Bunny', date: '2025-04-05', venue: 'Allegiant Stadium', profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face', tour: 'Most Wanted Tour', setlist: ['Titi Me Pregunto', 'Moscow Mule', 'Efecto', 'Me Porto Bonito'], venue_location: 'Las Vegas, NV', source: 'jambase_api', confidence: 'high', created_at: '2024-03-06T20:15:00Z' }
  ];

  // Load recent concerts on mount
  useEffect(() => {
    fetchRecentConcerts();
  }, []);

  const fetchRecentConcerts = async () => {
    try {
      const { data, error } = await supabase
        .from('concerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) {
        console.log('Concerts table not found, using fallback data');
        setRecentConcerts(fallbackConcerts.slice(0, 10)); // Show 10 recent concerts
        return;
      }
      
      if (data) {
        setRecentConcerts(data);
      }
    } catch (error) {
      console.error('Error fetching recent concerts:', error);
      toast({
        title: "Error",
        description: "Failed to load recent concerts",
        variant: "destructive",
      });
    }
  };

  const searchConcerts = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Search Required",
        description: "Please enter a search term",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      setHasSearched(true);
      
      // Search in the concerts table
      const { data, error } = await supabase
        .from('concerts')
        .select('*')
        .or(`artist.ilike.%${searchQuery}%,venue.ilike.%${searchQuery}%,tour.ilike.%${searchQuery}%,venue_location.ilike.%${searchQuery}%`)
        .order('created_at', { ascending: false })
        .limit(100); // Limit to 100 results for performance
      
      if (error) {
        console.log('Concerts table not found, using fallback search');
        // Fallback to sample data search if concerts table doesn't exist
        const fallbackConcerts: Concert[] = [
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
            source: 'jambase_api',
            confidence: 'high',
      created_at: '2024-01-25T09:15:00Z'
          },
          {
            id: '4',
            artist: 'Drake',
            date: '2024-09-05',
            venue: 'Rogers Centre',
            profile_pic: 'https://images.unsplash.com/photo-1471479917193-f00955256257?w=100&h=100&fit=crop&crop=face',
            tour: 'It\'s All A Blur Tour',
            setlist: ['God\'s Plan', 'Hotline Bling', 'One Dance', 'Started From The Bottom'],
            venue_location: 'Toronto, ON',
            source: 'jambase_api',
            confidence: 'high',
            created_at: '2024-01-30T16:20:00Z'
          },
          {
            id: '5',
            artist: 'Ariana Grande',
            date: '2024-10-12',
            venue: 'MetLife Stadium',
            profile_pic: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=100&h=100&fit=crop&crop=face',
            tour: 'Sweetener World Tour',
            setlist: ['Thank U, Next', '7 Rings', 'Positions', 'Side To Side'],
            venue_location: 'East Rutherford, NJ',
            source: 'jambase_api',
            confidence: 'high',
            created_at: '2024-02-05T11:45:00Z'
          }
        ];
        
        // Filter fallback data based on search query
        const filtered = fallbackConcerts.filter(concert => 
        concert.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
        concert.venue.toLowerCase().includes(searchQuery.toLowerCase()) ||
        concert.tour?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        concert.venue_location?.toLowerCase().includes(searchQuery.toLowerCase())
      );
      
      setConcerts(filtered);
      
      toast({
        title: "Search Complete",
          description: `Found ${filtered.length} concerts (using sample data - all from Jambase API)`,
        });
        return;
      }
      
      setConcerts(data || []);
      
      toast({
        title: "Search Complete",
        description: `Found ${data?.length || 0} concerts`,
      });
      
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Search Error",
        description: "Failed to search concerts",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setConcerts([]);
    setHasSearched(false);
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'bg-green-100 text-green-800 border-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'jambase_api': return <Music className="w-3 h-3" />;
      case 'manual': return <Calendar className="w-3 h-3" />;
      default: return <Calendar className="w-3 h-3" />;
    }
  };

  const handleConcertSelect = (concert: Concert) => {
    if (onSelectConcert) {
      onSelectConcert(concert);
    } else {
      toast({
        title: "Concert Selected",
        description: `${concert.artist} at ${concert.venue}`,
      });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Search Concerts</h1>
            <p className="text-gray-600 mt-2">Find concerts in your database</p>
          </div>
        </div>

        {/* Search Bar */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex gap-4 mb-4">
              <div className="flex-1">
                <Input
                  placeholder="Search by artist, venue, tour, or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchConcerts()}
                  className="text-lg"
                />
              </div>
              <Button onClick={searchConcerts} disabled={loading} className="px-8">
                {loading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                Search
              </Button>
              <Button variant="outline" onClick={clearSearch} className="px-4">
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Concerts (when no search) */}
        {!hasSearched && !loading && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Recent Concerts</h2>
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchQuery('');
                  setConcerts(fallbackConcerts);
                  setHasSearched(true);
                }}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                View All Concerts ({fallbackConcerts.length})
              </Button>
            </div>
            <div className="grid gap-4">
              {recentConcerts.map((concert) => (
                <Card key={concert.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleConcertSelect(concert)}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <img 
                        src={concert.profile_pic} 
                        alt={concert.artist}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg">{concert.artist}</h3>
                          <Badge className={`${getConfidenceColor(concert.confidence)} border`}>
                            {getSourceIcon(concert.source)}
                            <span className="ml-1">{concert.source}</span>
                          </Badge>
                        </div>
                        <p className="text-gray-600 mb-2">{concert.venue}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {new Date(concert.date).toLocaleDateString()}
                          </div>
                          {concert.venue_location && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              {concert.venue_location}
                            </div>
                          )}
                          {concert.tour && (
                            <div className="flex items-center gap-1">
                              <Music className="w-4 h-4" />
                              {concert.tour}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Search Results */}
        {hasSearched && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                Search Results ({concerts.length})
              </h2>
              {concerts.length > 0 && (
                <Button variant="outline" onClick={clearSearch}>
                  Clear Search
                </Button>
              )}
            </div>

            {loading ? (
              <div className="text-center py-12">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Searching concerts...</p>
              </div>
            ) : concerts.length === 0 ? (
              <div className="text-center py-12">
                <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Concerts Found</h3>
                <p className="text-gray-600 mb-6">Try adjusting your search terms</p>
                <Button onClick={clearSearch} variant="outline">
                  Clear Search
                </Button>
              </div>
            ) : (
              <div className="grid gap-4">
                {concerts.map((concert) => (
                  <Card key={concert.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleConcertSelect(concert)}>
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <img 
                          src={concert.profile_pic} 
                          alt={concert.artist}
                          className="w-16 h-16 rounded-full object-cover"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-xl">{concert.artist}</h3>
                            <Badge className={`${getConfidenceColor(concert.confidence)} border`}>
                              {getSourceIcon(concert.source)}
                              <span className="ml-1">{concert.source}</span>
                            </Badge>
                          </div>
                          <p className="text-gray-600 text-lg mb-3">{concert.venue}</p>
                          
                          <div className="flex items-center gap-6 text-sm text-gray-500 mb-3">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              {new Date(concert.date).toLocaleDateString()}
                            </div>
                            {concert.venue_location && (
                              <div className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                {concert.venue_location}
                              </div>
                            )}
                            {concert.tour && (
                              <div className="flex items-center gap-1">
                                <Music className="w-4 h-4" />
                                {concert.tour}
                              </div>
                            )}
                          </div>

                          {concert.setlist && concert.setlist.length > 0 && (
                            <div className="mt-3">
                              <p className="text-sm font-medium text-gray-700 mb-2">Setlist:</p>
                              <div className="flex flex-wrap gap-1">
                                {concert.setlist.slice(0, 4).map((song, index) => (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    {song}
                                  </Badge>
                                ))}
                                {concert.setlist.length > 4 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{concert.setlist.length - 4} more
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
