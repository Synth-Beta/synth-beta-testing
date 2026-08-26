# Chat parity + features — 2026-08-25

Two additive migrations. Review each, then apply in the Supabase SQL editor.

**Nothing here is required for chat to keep working.** The app probes for both
schema changes at runtime and degrades quietly if they are absent: threads load,
messages send, and the reply/reaction UI simply stays inert. Proven by
`packages/synth-shared/src/chatDegradation.test.ts`.

| file | enables | without it |
|---|---|---|
| `01_message_reply_to.sql` | reply / quote a message | replies send as normal messages, no quote bar |
| `02_message_reactions.sql` | emoji reactions | no reaction pills, picker does nothing |

Typing indicators and online presence need **no migration** — they ride Realtime
broadcast/presence over the websocket and never touch Postgres.

## Order

`01` and `02` are independent. Either order, or just one.

## Editor caution

Per the venue- and event-dedup notes: the Supabase web editor wraps a multi-statement
paste in a single transaction, and a "Failed to fetch" mid-run leaves an orphaned
session holding locks. Both files are small and fast, but if one does stall, run the
statements individually rather than re-pasting the whole file.

## Verify after applying

Each file ends with commented read-only verification queries. Run those rather than
trusting the editor's success toast.

Quick end-to-end check once both are applied:

1. Open a chat on web, long-press/hover a message, add a reaction — it should appear
   within a second on a second client in the same chat.
2. Reply to a message; the quote bar should render above the reply on both platforms.
3. Delete the quoted message — the reply must survive with its quote gone, not vanish
   (that is `ON DELETE SET NULL` doing its job).
