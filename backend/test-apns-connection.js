/**
 * APNs Connection Test Script
 * Tests the APNs authentication and connection
 * 
 * Usage: node backend/test-apns-connection.js [device_token]
 * 
 * If device_token is provided, it will attempt to send a test notification.
 * Otherwise, it just tests the connection.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });

const apn = require('apn');
const fs = require('fs');
const path = require('path');

// Configuration from environment variables
const APNS_KEY_PATH = process.env.APNS_KEY_PATH || './AuthKey_J764D4P5DU.p8';
const APNS_KEY_ID = process.env.APNS_KEY_ID || 'J764D4P5DU';
const APNS_TEAM_ID = process.env.APNS_TEAM_ID || 'R6JXB945ND';
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'com.tejpatel.synth';
const NODE_ENV = process.env.NODE_ENV || 'production';

console.log('🧪 Testing APNs Connection...\n');
console.log('Configuration:');
console.log(`  Key Path: ${APNS_KEY_PATH}`);
console.log(`  Key ID: ${APNS_KEY_ID}`);
console.log(`  Team ID: ${APNS_TEAM_ID}`);
console.log(`  Bundle ID: ${APNS_BUNDLE_ID}`);
console.log(`  Environment: ${NODE_ENV === 'production' ? 'Production' : 'Sandbox'}\n`);

// Check if key file exists
if (!fs.existsSync(APNS_KEY_PATH)) {
  console.error(`❌ APNs key file not found at: ${APNS_KEY_PATH}`);
  console.error(`   Please ensure the .p8 file is in the backend directory.`);
  process.exit(1);
}

// Read and verify key file
let keyContent;
try {
  keyContent = fs.readFileSync(APNS_KEY_PATH);
  if (!keyContent || keyContent.length === 0) {
    throw new Error('Key file is empty');
  }
  console.log('✅ APNs key file found and readable');
} catch (error) {
  console.error(`❌ Error reading APNs key file: ${error.message}`);
  process.exit(1);
}

// Initialize APNs provider
let provider;
try {
  const options = {
    token: {
      key: keyContent,
      keyId: APNS_KEY_ID,
      teamId: APNS_TEAM_ID
    },
    production: NODE_ENV === 'production'
  };

  provider = new apn.Provider(options);
  console.log('✅ APNs provider initialized successfully\n');
} catch (error) {
  console.error(`❌ Error initializing APNs provider: ${error.message}`);
  console.error(`   Check that Key ID, Team ID, and key file are correct.`);
  process.exit(1);
}

// Test sending a notification if device token provided
const deviceToken = process.argv[2];

if (deviceToken) {
  console.log(`📱 Sending test notification to device token: ${deviceToken}\n`);
  
  const notification = new apn.Notification();
  
  notification.alert = {
    title: 'Test Push Notification',
    body: 'This is a test notification from APNs connection test 🎉'
  };
  
  notification.badge = 1;
  notification.sound = 'default';
  notification.topic = APNS_BUNDLE_ID;
  notification.payload = {
    type: 'test',
    timestamp: new Date().toISOString()
  };
  notification.expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
  notification.priority = 10;

  provider.send(notification, deviceToken).then((result) => {
    console.log('📤 Send Result:');
    console.log(`  Sent: ${result.sent ? result.sent.length : 0}`);
    console.log(`  Failed: ${result.failed ? result.failed.length : 0}\n`);

    if (result.sent && result.sent.length > 0) {
      console.log('✅ Notification sent successfully!');
      console.log(`   Check your device for the test notification.\n`);
    }

    if (result.failed && result.failed.length > 0) {
      const error = result.failed[0];
      console.error('❌ Failed to send notification:');
      console.error(`   Status: ${error.status}`);
      console.error(`   Reason: ${error.response?.reason || error.error || 'Unknown'}`);
      console.error(`   Device Token: ${error.device}`);
      
      if (error.status === 403) {
        console.error('\n   💡 This usually means:');
        console.error('      - Key ID or Team ID is incorrect');
        console.error('      - Key file doesn\'t match the Key ID');
        console.error('      - Key doesn\'t have APNs enabled');
      } else if (error.status === 400) {
        console.error('\n   💡 This usually means:');
        console.error('      - Device token format is invalid');
        console.error('      - Bundle ID doesn\'t match');
      } else if (error.status === 410) {
        console.error('\n   💡 This usually means:');
        console.error('      - Device token is invalid or expired');
      }
      
      console.error('');
    }

    // Close provider connection
    provider.shutdown();
    process.exit(result.failed && result.failed.length > 0 ? 1 : 0);
  }).catch((error) => {
    console.error(`❌ Error sending notification: ${error.message}`);
    provider.shutdown();
    process.exit(1);
  });
} else {
  console.log('✅ APNs connection established successfully!');
  console.log('   To test sending a notification, provide a device token:');
  console.log(`   node backend/test-apns-connection.js <device_token>\n`);
  console.log('   You can get a device token from the device_tokens table in Supabase.\n');
  
  // Close provider connection
  provider.shutdown();
  process.exit(0);
}

