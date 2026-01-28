-- ============================================================
-- Add Message Encryption Support
-- ============================================================
-- Adds is_encrypted column to messages table to track encryption status
-- Encrypted messages use AES-GCM encryption and can only be decrypted
-- by chat participants with the correct encryption key.
-- ============================================================

BEGIN;

-- Add is_encrypted column to messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false;

-- Create index for efficient queries on encrypted messages
CREATE INDEX IF NOT EXISTS idx_messages_is_encrypted 
ON public.messages(is_encrypted) 
WHERE is_encrypted = true;

-- Add comment explaining encryption status
COMMENT ON COLUMN public.messages.is_encrypted IS 
'Indicates if message content is encrypted. Encrypted messages use AES-GCM encryption (256-bit keys) and can only be decrypted by chat participants with the correct encryption key stored in their device. Unencrypted messages are stored as plain text for backward compatibility.';

COMMIT;
