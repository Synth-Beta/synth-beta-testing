/**
 * Sanitize a user-typed search term before embedding it in a PostgREST
 * `.or(...)` filter string. Inside `.or()`, commas separate clauses and
 * parentheses group them, so raw input like `x),user_id.not.is.null,(y`
 * injects extra filter conditions (filter injection). Strips those
 * metacharacters plus quotes/backslashes; `%`/`_` wildcards are left as-is
 * since terms are already wrapped in `%…%` patterns.
 *
 * Not needed for values passed through builder methods like `.ilike(col, val)`
 * or `.eq(col, val)` — those are encoded as single parameters by the client.
 */
export function sanitizeOrFilterTerm(term: string): string {
  return term.replace(/[,()"'\\]/g, ' ').replace(/\s+/g, ' ').trim();
}
