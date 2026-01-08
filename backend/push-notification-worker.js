/**
 * Push Notification Worker
 * Background service to process push notification queue
 * Run this as a separate process or scheduled job
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });

const pushNotificationService = require('./push-notification-service');

// Configuration
const PROCESS_INTERVAL = 30000; // 30 seconds
const BATCH_SIZE = 100; // Process 100 notifications at a time

/**
 * Queue pending notifications (no database function needed)
 */
async function queuePendingNotifications() {
  try {
    const result = await pushNotificationService.queuePendingNotifications(100);
    
    if (result.error) {
      console.error('Error queueing pending notifications:', result.error);
      return;
    }

    if (result.queued > 0) {
      console.log(`📬 Queued ${result.queued} new push notifications`);
    }
  } catch (error) {
    console.error('Error queueing pending notifications:', error);
  }
}

/**
 * Process push notification queue
 */
async function processPushQueue() {
  try {
    console.log(`[${new Date().toISOString()}] Processing push notification queue...`);
    
    // Queue any pending notifications (no trigger needed)
    await queuePendingNotifications();
    
    const result = await pushNotificationService.processQueue(BATCH_SIZE);
    
    if (result.processed > 0 || result.errors > 0) {
      console.log(`✅ Processed: ${result.processed}, Errors: ${result.errors}`);
    }
  } catch (error) {
    console.error('❌ Error processing push queue:', error);
  }
}

// Run immediately on startup
console.log('🚀 Push notification worker started');
processPushQueue();

// Run every 30 seconds
const interval = setInterval(processPushQueue, PROCESS_INTERVAL);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down push notification worker...');
  clearInterval(interval);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down push notification worker...');
  clearInterval(interval);
  process.exit(0);
});

