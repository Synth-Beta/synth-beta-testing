import { Event } from '@/components/EventCard';

export const mockEvents: Event[] = [
  {
    id: '1',
    title: 'Indie Rock Night at The Venue',
    venue: 'The Underground',
    date: 'Tonight',
    time: '8:00 PM',
    category: 'music',
    description: 'Local bands performing original music in an intimate setting. Great vibes and craft cocktails.',
    image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=300&fit=crop',
    price: '$15',
    attendeeCount: 23
  },
  {
    id: '2', 
    title: 'Weekend Food Truck Festival',
    venue: 'Central Park',
    date: 'Saturday',
    time: '11:00 AM',
    category: 'food',
    description: 'Over 20 food trucks featuring cuisines from around the world. Live music and family-friendly activities.',
    image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=300&fit=crop',
    price: 'Free',
    attendeeCount: 156
  },
  {
    id: '3',
    title: 'Contemporary Art Gallery Opening',
    venue: 'Modern Space Gallery',
    date: 'Friday',
    time: '6:00 PM',
    category: 'arts',
    description: 'Featuring emerging local artists exploring themes of community and connection. Wine and appetizers included.',
    image: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=300&fit=crop',
    attendeeCount: 42
  },
  {
    id: '4',
    title: 'Morning Yoga in the Park',
    venue: 'Riverside Park',
    date: 'Sunday',
    time: '9:00 AM',
    category: 'sports',
    description: 'All-levels yoga session with certified instructors. Bring your own mat or rent one on-site.',
    image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&h=300&fit=crop',
    price: '$12',
    attendeeCount: 34
  },
  {
    id: '5',
    title: 'Board Game Café Night',
    venue: 'The Game Corner',
    date: 'Thursday',
    time: '7:00 PM',
    category: 'social',
    description: 'Weekly meetup for board game enthusiasts. All skill levels welcome. Coffee, tea, and snacks available.',
    image: 'https://images.unsplash.com/photo-1606092195730-5d7b9af1efc5?w=400&h=300&fit=crop',
    price: '$8',
    attendeeCount: 28
  },
  {
    id: '6',
    title: 'Jazz Brunch at Riverside',
    venue: 'Riverside Bistro',
    date: 'Sunday',
    time: '11:30 AM',
    category: 'music',
    description: 'Live jazz trio performance while you enjoy weekend brunch. Reservations recommended.',
    image: 'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=400&h=300&fit=crop',
    price: '$25',
    attendeeCount: 67
  },
  {
    id: '7',
    title: 'Community Pottery Workshop',
    venue: 'Clay Studio',
    date: 'Saturday',
    time: '2:00 PM',
    category: 'arts',
    description: 'Learn hand-building techniques and create your own ceramic piece. All materials included.',
    image: 'https://images.unsplash.com/photo-1594736797933-d0aeac5c4c2b?w=400&h=300&fit=crop',
    price: '$35',
    attendeeCount: 12
  },
  {
    id: '8',
    title: 'Night Market & Street Food',
    venue: 'Downtown Square',
    date: 'Friday',
    time: '5:00 PM',
    category: 'food',
    description: 'Monthly night market featuring local vendors, artisans, and incredible street food from various cultures.',
    image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&h=300&fit=crop',
    price: 'Free',
    attendeeCount: 203
  }
];