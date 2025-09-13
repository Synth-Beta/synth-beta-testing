const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://glpiolbrafqikqhnseto.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';

const supabase = createClient(supabaseUrl, supabaseKey);

const sampleEvents = [
  {
    title: "Taylor Swift - The Eras Tour",
    artist_name: "Taylor Swift",
    artist_id: "taylor-swift-123",
    venue_name: "Madison Square Garden",
    venue_id: "msg-123",
    event_date: "2024-06-15T20:00:00Z",
    doors_time: "2024-06-15T19:00:00Z",
    description: "Taylor Swift brings her spectacular Eras Tour to Madison Square Garden",
    genres: ["Pop", "Country"],
    venue_address: "4 Pennsylvania Plaza",
    venue_city: "New York",
    venue_state: "NY",
    venue_zip: "10001",
    latitude: 40.7505,
    longitude: -73.9934,
    ticket_available: true,
    price_range: "$100-$500",
    ticket_urls: ["https://ticketmaster.com/taylor-swift"],
    tour_name: "The Eras Tour",
    jambase_event_id: "taylor-swift-msg-2024"
  },
  {
    title: "Drake - It's All A Blur Tour",
    artist_name: "Drake",
    artist_id: "drake-456",
    venue_name: "Rogers Centre",
    venue_id: "rogers-456",
    event_date: "2024-09-05T20:30:00Z",
    doors_time: "2024-09-05T19:30:00Z",
    description: "Drake's It's All A Blur Tour comes to Toronto",
    genres: ["Hip-Hop", "R&B"],
    venue_address: "1 Blue Jays Way",
    venue_city: "Toronto",
    venue_state: "ON",
    venue_zip: "M5V 1J1",
    latitude: 43.6414,
    longitude: -79.3894,
    ticket_available: true,
    price_range: "$150-$800",
    ticket_urls: ["https://ticketmaster.com/drake"],
    tour_name: "It's All A Blur Tour",
    jambase_event_id: "drake-rogers-2024"
  },
  {
    title: "Billie Eilish - Happier Than Ever Tour",
    artist_name: "Billie Eilish",
    artist_id: "billie-eilish-789",
    venue_name: "Hollywood Bowl",
    venue_id: "hollywood-bowl-789",
    event_date: "2024-08-10T20:00:00Z",
    doors_time: "2024-08-10T19:00:00Z",
    description: "Billie Eilish performs at the iconic Hollywood Bowl",
    genres: ["Pop", "Alternative"],
    venue_address: "2301 N Highland Ave",
    venue_city: "Los Angeles",
    venue_state: "CA",
    venue_zip: "90068",
    latitude: 34.1125,
    longitude: -118.3396,
    ticket_available: true,
    price_range: "$80-$300",
    ticket_urls: ["https://ticketmaster.com/billie-eilish"],
    tour_name: "Happier Than Ever Tour",
    jambase_event_id: "billie-eilish-hollywood-2024"
  },
  {
    title: "The Weeknd - After Hours Til Dawn Tour",
    artist_name: "The Weeknd",
    artist_id: "weeknd-101",
    venue_name: "SoFi Stadium",
    venue_id: "sofi-101",
    event_date: "2024-07-22T20:00:00Z",
    doors_time: "2024-07-22T19:00:00Z",
    description: "The Weeknd's spectacular stadium tour",
    genres: ["R&B", "Pop"],
    venue_address: "1001 Stadium Dr",
    venue_city: "Inglewood",
    venue_state: "CA",
    venue_zip: "90301",
    latitude: 33.9533,
    longitude: -118.3387,
    ticket_available: true,
    price_range: "$120-$600",
    ticket_urls: ["https://ticketmaster.com/weeknd"],
    tour_name: "After Hours Til Dawn Tour",
    jambase_event_id: "weeknd-sofi-2024"
  },
  {
    title: "Ariana Grande - Sweetener World Tour",
    artist_name: "Ariana Grande",
    artist_id: "ariana-grande-202",
    venue_name: "MetLife Stadium",
    venue_id: "metlife-202",
    event_date: "2024-10-12T20:00:00Z",
    doors_time: "2024-10-12T19:00:00Z",
    description: "Ariana Grande's Sweetener World Tour",
    genres: ["Pop", "R&B"],
    venue_address: "1 MetLife Stadium Dr",
    venue_city: "East Rutherford",
    venue_state: "NJ",
    venue_zip: "07073",
    latitude: 40.8136,
    longitude: -74.0744,
    ticket_available: true,
    price_range: "$100-$400",
    ticket_urls: ["https://ticketmaster.com/ariana-grande"],
    tour_name: "Sweetener World Tour",
    jambase_event_id: "ariana-grande-metlife-2024"
  }
];

async function seedSampleEvents() {
  console.log('Seeding sample events...\n');

  try {
    const { data, error } = await supabase
      .from('jambase_events')
      .insert(sampleEvents)
      .select();

    if (error) {
      console.error('❌ Error seeding events:', error);
      return;
    }

    console.log(`✅ Successfully seeded ${data.length} sample events!`);
    console.log('\nSample events added:');
    data.forEach((event, index) => {
      console.log(`${index + 1}. ${event.artist_name} at ${event.venue_name} on ${new Date(event.event_date).toLocaleDateString()}`);
    });

    console.log('\n🎉 You can now test the search functionality!');
    console.log('Try searching for: "Taylor Swift", "Drake", "Billie Eilish", etc.');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

seedSampleEvents();
