// Test script for location-based JamBase integration
const { JamBaseLocationService } = require('./src/services/jambaseLocationService.ts');

async function testLocationIntegration() {
  console.log('🧪 Testing Location-Based JamBase Integration...\n');
  
  try {
    // Test 1: Search by city name
    console.log('📍 Test 1: Searching events by city name (New York)');
    const nycResult = await JamBaseLocationService.searchEventsForLocationInput('New York', 25);
    console.log(`✅ Found ${nycResult.events.length} events near ${nycResult.location.name}`);
    console.log(`   Source: ${nycResult.source}`);
    console.log(`   Location: ${nycResult.location.lat}, ${nycResult.location.lng}`);
    
    if (nycResult.events.length > 0) {
      console.log(`   Sample event: ${nycResult.events[0].title} at ${nycResult.events[0].venue_name}`);
    }
    console.log('');
    
    // Test 2: Search by coordinates
    console.log('📍 Test 2: Searching events by coordinates (Los Angeles)');
    const laResult = await JamBaseLocationService.searchEventsForLocationInput({ lat: 34.0522, lng: -118.2437 }, 25);
    console.log(`✅ Found ${laResult.events.length} events near coordinates`);
    console.log(`   Source: ${laResult.source}`);
    console.log(`   Location: ${laResult.location.lat}, ${laResult.location.lng}`);
    
    if (laResult.events.length > 0) {
      console.log(`   Sample event: ${laResult.events[0].title} at ${laResult.events[0].venue_name}`);
    }
    console.log('');
    
    // Test 3: Search for user location (mock)
    console.log('📍 Test 3: Searching events for user location (Austin, TX)');
    const userResult = await JamBaseLocationService.searchEventsForUserLocation(
      { latitude: 30.2672, longitude: -97.7431 }, 
      25
    );
    console.log(`✅ Found ${userResult.events.length} events near user location`);
    console.log(`   Source: ${userResult.source}`);
    console.log(`   Location: ${userResult.location.lat}, ${userResult.location.lng}`);
    
    if (userResult.events.length > 0) {
      console.log(`   Sample event: ${userResult.events[0].title} at ${userResult.events[0].venue_name}`);
    }
    console.log('');
    
    console.log('🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  testLocationIntegration();
}

module.exports = { testLocationIntegration };
