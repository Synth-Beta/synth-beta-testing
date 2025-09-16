// Test script to verify the friends system works
const { createClient } = require('@supabase/supabase-js');

// You'll need to replace these with your actual Supabase URL and anon key
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseKey = 'YOUR_SUPABASE_ANON_KEY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testFriendsSystem() {
  console.log('🧪 Testing Friends System...');
  
  try {
    // Test 1: Check if tables exist
    console.log('\n1. Checking if new tables exist...');
    
    const { data: notifications, error: notificationsError } = await supabase
      .from('notifications')
      .select('*')
      .limit(1);
    
    if (notificationsError) {
      console.log('❌ Notifications table error:', notificationsError.message);
    } else {
      console.log('✅ Notifications table exists');
    }
    
    const { data: friends, error: friendsError } = await supabase
      .from('friends')
      .select('*')
      .limit(1);
    
    if (friendsError) {
      console.log('❌ Friends table error:', friendsError.message);
    } else {
      console.log('✅ Friends table exists');
    }
    
    const { data: friendRequests, error: friendRequestsError } = await supabase
      .from('friend_requests')
      .select('*')
      .limit(1);
    
    if (friendRequestsError) {
      console.log('❌ Friend requests table error:', friendRequestsError.message);
    } else {
      console.log('✅ Friend requests table exists');
    }
    
    // Test 2: Check if functions exist
    console.log('\n2. Checking if functions exist...');
    
    const { data: createFunction, error: createError } = await supabase
      .rpc('create_friend_request', { receiver_user_id: '00000000-0000-0000-0000-000000000000' });
    
    if (createError) {
      console.log('❌ create_friend_request function error:', createError.message);
    } else {
      console.log('✅ create_friend_request function exists');
    }
    
    console.log('\n🎉 Friends system test completed!');
    console.log('\nTo test the full functionality:');
    console.log('1. Run the database migration: supabase db push');
    console.log('2. Start your app: npm run dev');
    console.log('3. Create two user accounts');
    console.log('4. Search for a user and send a friend request');
    console.log('5. Check the notification bell for the friend request');
    console.log('6. Accept/decline the friend request');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  testFriendsSystem();
}

module.exports = { testFriendsSystem };
