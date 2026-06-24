export function generateDailyBotMessage(opts: {
  genreSlug: string;
  bot: { user_id: string; displayName?: string; username?: string };
}): {
  sender_id: string;
  content: string;
  created_at: string;
  message_type: string;
  is_encrypted: boolean;
  metadata: Record<string, unknown>;
} | null;

export function randomInt(min: number, max: number): number;

export function shuffle<T>(arr: T[]): T[];
