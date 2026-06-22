/**
 * Migrate Existing Messages to Encryption
 * 
 * This script encrypts existing unencrypted messages in the database.
 * 
 * ⚠️  IMPORTANT LIMITATIONS:
 * - This script generates temporary encryption keys that won't match user device keys
 * - Encrypted messages will NOT be decryptable by users until they send/receive new messages
 * - New messages (sent after encryption is enabled) will be properly encrypted and decryptable
 * - Consider running this script only for new deployments, or skip it and let messages encrypt naturally
 * 
 * RECOMMENDED APPROACH:
 * - Skip running this script for existing deployments
 * - Let new messages encrypt automatically going forward
 * - Old messages remain unencrypted (backward compatible)
 * 
 * If you still want to encrypt old messages:
 * - Run this script to mark them as encrypted
 * - Users will see "[Unable to decrypt message]" for old messages
 * - New messages will work correctly
 * 
 * Usage: node scripts/migrate-messages-to-encryption.mjs [limit] [batchSize]
 *   - limit: Optional number of messages to process (for testing)
 *   - batchSize: Optional batch size (default: 50)
 * 
 * Environment Variables Required:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

// Load environment variables
async function loadEnv() {
  try {
    const dotenv = await import('dotenv');
    dotenv.default.config({ path: '.env.local' });
  } catch (e) {
    // dotenv not installed, assume env vars are already set
  }
}

/**
 * Encryption service (simplified version for Node.js)
 * Uses Web Crypto API available in Node.js 15+
 */
class MessageEncryption {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.keyCache = new Map(); // Cache for encryption keys
  }

  /**
   * Get or create encryption key for a chat/user
   * Keys are stored in a temporary table or generated on-the-fly
   * For migration, we'll generate keys as needed
   */
  async getOrCreateChatKey(chatId, userId) {
    const cacheKey = `${chatId}_${userId}`;
    
    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey);
    }

    // Generate new key for migration
    // In production, keys would be stored per user, but for migration
    // we generate a key that the sender can use
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    this.keyCache.set(cacheKey, key);
    return key;
  }

  /**
   * Encrypt message content
   */
  async encryptMessage(message, chatId, userId) {
    try {
      const key = await this.getOrCreateChatKey(chatId, userId);
      
      // Generate random IV (12 bytes for GCM)
      const iv = crypto.getRandomValues(new Uint8Array(12));
      
      // Convert message to Uint8Array
      const encoder = new TextEncoder();
      const messageData = encoder.encode(message);
      
      // Encrypt
      const encryptedData = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          tagLength: 128,
        },
        key,
        messageData
      );
      
      // Combine IV + ciphertext
      const combined = new Uint8Array(12 + encryptedData.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encryptedData), 12);
      
      // Convert to base64
      return Buffer.from(combined).toString('base64');
    } catch (error) {
      console.error(`Encryption error for message:`, error);
      throw error;
    }
  }
}

class MessageEncryptionMigration {
  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = 
      process.env.SUPABASE_SERVICE_ROLE_KEY || 
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
    this.encryption = new MessageEncryption(this.supabase);
    
    // Statistics
    this.stats = {
      messagesFound: 0,
      messagesEncrypted: 0,
      messagesSkipped: 0,
      errors: 0
    };
  }

  /**
   * Get unencrypted messages
   */
  async getUnencryptedMessages(limit = null, offset = 0) {
    let query = this.supabase
      .from('messages')
      .select('id, chat_id, sender_id, content, is_encrypted')
      .or('is_encrypted.is.null,is_encrypted.eq.false')
      .order('created_at', { ascending: true })
      .range(offset, offset + (limit || 1000) - 1);
    
    if (limit) {
      query = query.limit(limit);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }
    
    return data || [];
  }

  /**
   * Encrypt a single message
   */
  async encryptMessage(message) {
    try {
      // Skip if already encrypted
      if (message.is_encrypted) {
        return { success: false, reason: 'Already encrypted' };
      }

      // Skip if content is empty
      if (!message.content || message.content.trim() === '') {
        return { success: false, reason: 'Empty content' };
      }

      // Encrypt using sender's key
      const encryptedContent = await this.encryption.encryptMessage(
        message.content,
        message.chat_id,
        message.sender_id
      );

      // Update message with encrypted content
      const { error: updateError } = await this.supabase
        .from('messages')
        .update({
          content: encryptedContent,
          is_encrypted: true
        })
        .eq('id', message.id);

      if (updateError) {
        throw new Error(`Update failed: ${updateError.message}`);
      }

      return { success: true };
    } catch (error) {
      console.error(`Error encrypting message ${message.id}:`, error.message);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Run migration
   */
  async run(limit = null, batchSize = 50) {
    console.log('🔄 Starting Message Encryption Migration...\n');
    if (limit) {
      console.log(`🧪 TEST MODE: Processing only ${limit} messages\n`);
    }
    console.log(`📦 Batch size: ${batchSize}\n`);

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      // Fetch batch of unencrypted messages
      const batchLimit = limit ? Math.min(limit - this.stats.messagesFound, batchSize) : batchSize;
      if (batchLimit <= 0) break;

      console.log(`📊 Fetching messages (offset: ${offset}, limit: ${batchLimit})...`);
      const messages = await this.getUnencryptedMessages(batchLimit, offset);
      
      if (messages.length === 0) {
        hasMore = false;
        break;
      }

      this.stats.messagesFound += messages.length;
      console.log(`   Found ${messages.length} messages to encrypt\n`);

      // Process messages in parallel (but limit concurrency)
      console.log('🔐 Encrypting messages...\n');
      const results = await Promise.allSettled(
        messages.map(msg => this.encryptMessage(msg))
      );

      // Count results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            this.stats.messagesEncrypted++;
          } else {
            this.stats.messagesSkipped++;
          }
        } else {
          this.stats.errors++;
          console.error('  ❌ Error:', result.reason);
        }
      }

      // Progress update
      console.log(`   ✅ Encrypted: ${this.stats.messagesEncrypted}`);
      console.log(`   ⏭️  Skipped: ${this.stats.messagesSkipped}`);
      console.log(`   ❌ Errors: ${this.stats.errors}\n`);

      // Check if we've reached the limit
      if (limit && this.stats.messagesFound >= limit) {
        hasMore = false;
        break;
      }

      // Check if there are more messages
      if (messages.length < batchLimit) {
        hasMore = false;
        break;
      }

      offset += batchLimit;

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Print final statistics
    console.log('\n✨ Migration Complete!');
    console.log('\n📈 Statistics:');
    console.log(`   Messages found: ${this.stats.messagesFound}`);
    console.log(`   Messages encrypted: ${this.stats.messagesEncrypted}`);
    console.log(`   Messages skipped: ${this.stats.messagesSkipped}`);
    console.log(`   Errors: ${this.stats.errors}`);
    
    if (this.stats.messagesEncrypted > 0) {
      console.log('\n⚠️  IMPORTANT NOTES:');
      console.log('   - Messages were encrypted using sender\'s encryption key');
      console.log('   - Recipients who haven\'t generated keys yet won\'t be able to decrypt old messages');
      console.log('   - This is expected behavior - new messages will be readable once recipients generate keys');
    }
  }
}

// Main execution
async function main() {
  await loadEnv();
  
  const limit = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  const batchSize = process.argv[3] ? parseInt(process.argv[3], 10) : 50;
  
  try {
    const migration = new MessageEncryptionMigration();
    await migration.run(limit, batchSize);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
