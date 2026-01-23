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
    const startTime = Date.now();
    const result = await pushNotificationService.queuePendingNotifications(100);
    const duration = Date.now() - startTime;
    
    if (result.error) {
      console.error(`[${new Date().toISOString()}] ❌ Error queueing pending notifications:`, result.error);
      return;
    }

    if (result.queued > 0) {
      console.log(`[${new Date().toISOString()}] 📬 Queued ${result.queued} new push notifications (${duration}ms)`);
    } else {
      console.log(`[${new Date().toISOString()}] ℹ️  No new notifications to queue (${duration}ms)`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Error queueing pending notifications:`, error);
  }
}

/**
 * Process push notification queue
 */
async function processPushQueue() {
  const cycleStartTime = Date.now();
  try {
    console.log(`[${new Date().toISOString()}] 🔄 Starting push notification processing cycle...`);
    
    // Queue any pending notifications (no trigger needed)
    await queuePendingNotifications();
    
    const processStartTime = Date.now();
    const result = await pushNotificationService.processQueue(BATCH_SIZE);
    const processDuration = Date.now() - processStartTime;
    
    const totalDuration = Date.now() - cycleStartTime;
    
    if (result.processed > 0 || result.errors > 0) {
      console.log(`[${new Date().toISOString()}] ✅ Cycle complete: Processed ${result.processed}, Errors ${result.errors} (${processDuration}ms processing, ${totalDuration}ms total)`);
    } else {
      console.log(`[${new Date().toISOString()}] ℹ️  Cycle complete: No items to process (${totalDuration}ms total)`);
    }
  } catch (error) {
    const totalDuration = Date.now() - cycleStartTime;
    console.error(`[${new Date().toISOString()}] ❌ Error processing push queue (${totalDuration}ms):`, error);
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

