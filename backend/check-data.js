const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://glpiolbrafqikqhnseto.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdscGlvbGJyYWZxaWtxaG5zZXRvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjkzNzgyNCwiZXhwIjoyMDcyNTEzODI0fQ.cS0y6dQiw2VvGD7tKfKADKqM8whaopJ716G4dexBRGI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  console.log('Checking database tables...\n');

  // Check jambase_events table
  console.log('1. Checking jambase_events table:');
  const { data: jambaseEvents, error: jambaseError } = await supabase
    .from('jambase_events')
    .select('count')
    .limit(1);
  
  if (jambaseError) {
    console.log('❌ Error:', jambaseError.message);
  } else {
    console.log('✅ jambase_events table accessible');
  }

  // Check concerts table
  console.log('\n2. Checking concerts table:');
  const { data: concerts, error: concertsError } = await supabase
    .from('concerts')
    .select('count')
    .limit(1);
  
  if (concertsError) {
    console.log('❌ Error:', concertsError.message);
  } else {
    console.log('✅ concerts table accessible');
  }

  // Get actual counts
  console.log('\n3. Getting actual counts:');
  
  const { count: jambaseCount } = await supabase
    .from('jambase_events')
    .select('*', { count: 'exact', head: true });
  
  const { count: concertsCount } = await supabase
    .from('concerts')
    .select('*', { count: 'exact', head: true });

  console.log(`jambase_events: ${jambaseCount} records`);
  console.log(`concerts: ${concertsCount} records`);

  // If concerts table has data but jambase_events doesn't, suggest migration
  if (concertsCount > 0 && jambaseCount === 0) {
    console.log('\n4. Migration needed:');
    console.log('The concerts table has data but jambase_events is empty.');
    console.log('You may need to migrate data from concerts to jambase_events.');
    
    // Show sample data from concerts table
    const { data: sampleConcerts } = await supabase
      .from('concerts')
      .select('*')
      .limit(3);
    
    console.log('\nSample concerts data:');
    console.log(JSON.stringify(sampleConcerts, null, 2));
  }

  // Check if there are any events at all
  if (jambaseCount === 0 && concertsCount === 0) {
    console.log('\n4. No data found:');
    console.log('Both tables are empty. You may need to:');
    console.log('- Add some sample data');
    console.log('- Test the JamBase API integration');
    console.log('- Check if the frontend is properly creating events');
  }
}

checkData().catch(console.error);
