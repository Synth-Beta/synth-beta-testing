import assert from "node:assert/strict";
import { mock } from "node:test";
import handler from "../../../api/_lib/cron/newsletterSend";
import { contentHash, deliveryKey, deliverApprovedDrafts, planSend, type StoredDraft } from "../../../api/_lib/newsletterDelivery";

const hash = await contentHash("Subject", '<a href="{{unsubscribe_url}}" style="color:#8A8F98;text-decoration:underline;">Unsubscribe</a>');
const base: StoredDraft = { id: "draft", editionDate: "2026-10-12", userId: "user", email: "user@example.com", subject: "Subject", html: '<a href="{{unsubscribe_url}}" style="color:#8A8F98;text-decoration:underline;">Unsubscribe</a>', contentHash: hash, approvedContentHash: hash, status: "approved", sentAt: null };
assert.deepEqual(planSend([{ ...base, status: "needs_approval" }, base], new Set()).send, [base]);
let claims = 0;
const corrupt = await deliverApprovedDrafts({ drafts: [{ ...base, html: "unreviewed replacement" }], unsubscribedEmails: new Set(), claim: async () => { claims++; return true; }, sendEmail: async () => { throw new Error("Must never send"); }, release: async () => {} });
assert.equal(claims, 0);
assert.match(corrupt.skip[0].reason, /stored content/);

const toRow = (draft: StoredDraft) => ({ id: draft.id, edition_date: draft.editionDate, user_id: draft.userId, email: draft.email, subject: draft.subject, html: draft.html, content_hash: draft.contentHash, approved_content_hash: draft.approvedContentHash, status: draft.status, sent_at: draft.sentAt });
let rows = [toRow(base)];
let unsubscribes: any[] = [];
let eligible = [{ user_id: base.userId, email: base.email }];
let unsubscribeFailure = false;
let providerFailure = false;
let deliveries: Array<{ key: string; payload: any }> = [];
let mutations: any[] = [];
const pages: string[] = [];
globalThis.fetch = async (input: any, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "api.resend.com") {
    deliveries.push({ key: new Headers(init?.headers).get("Idempotency-Key")!, payload: JSON.parse(String(init?.body)) });
    return Response.json(providerFailure ? { message: "Provider unavailable" } : { id: "provider-id" }, { status: providerFailure ? 503 : 200 });
  }
  const table = url.pathname.split("/").at(-1)!;
  if (init?.method === "PATCH") {
    const update = JSON.parse(String(init.body)); mutations.push(update);
    return Response.json(update.status === "sent" ? [{ id: base.id }] : []);
  }
  if (table === "newsletter_unsubscribes" && unsubscribeFailure) return Response.json({ message: "Subscription database unavailable" }, { status: 500 });
  const list = table === "newsletter_drafts" ? rows : table === "users" ? eligible : table === "newsletter_unsubscribes" ? unsubscribes : [];
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 500);
  pages.push(`${table}:${offset}`);
  return Response.json(list.slice(offset, offset + limit));
};

for (const [name, value] of Object.entries({ CRON_SECRET: "test-only-cron", SUPABASE_URL: "https://newsletter-test.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-only-service", RESEND_API_KEY: "test-only-provider", RESEND_FROM_EMAIL: "test@example.com", NEWSLETTER_UNSUBSCRIBE_SECRET: "test-only-signing" })) process.env[name] = value;
mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-12T15:00:00Z").getTime() });
const invoke = async (authorization = "Bearer test-only-cron") => {
  let code = 0; let body: any;
  const response: any = { status(status: number) { code = status; return response; }, json(json: any) { body = json; return response; } };
  await handler({ method: "GET", headers: { authorization } } as any, response);
  return { code, body };
};
assert.equal((await invoke("Bearer invalid")).code, 401);
unsubscribeFailure = true;
assert.equal((await invoke()).code, 500);
assert.equal(deliveries.length, 0, "subscription errors fail closed");
unsubscribeFailure = false;
rows = [toRow({ ...base, status: "needs_approval" }), toRow({ ...base, id: "corrupt", html: "changed" }), toRow({ ...base, id: "already-sent", status: "sent", sentAt: "2026-10-12T15:00:00Z" })];
assert.equal((await invoke()).body.sent, 0);
assert.equal(deliveries.length, 0);

rows = [toRow(base)];
eligible = [];
assert.equal((await invoke()).body.sent, 0, "deactivated or removed users cannot receive old drafts");
eligible = [{ user_id: base.userId, email: base.email }];
unsubscribes = Array.from({ length: 501 }, (_, i) => ({ email: `unsubscribed${i}@example.com` }));
unsubscribes.push({ email: base.email });
assert.equal((await invoke()).body.sent, 0);
assert.ok(pages.includes("newsletter_unsubscribes:500"));
unsubscribes = [];
providerFailure = true;
const failed = await invoke();
assert.equal(failed.code, 502);
assert.equal(failed.body.failed, 1);
assert.ok(mutations.some((mutation) => mutation.status === "approved" && mutation.sent_at === null));
providerFailure = false;
const sent = await invoke();
assert.equal(sent.code, 200);
assert.equal(sent.body.sent, 1);
assert.equal(deliveries[0].key, deliveryKey(base));
assert.equal(deliveries[1].key, deliveries[0].key, "retry must use the same provider key");
assert.doesNotMatch(deliveries[1].payload.html, /\{\{unsubscribe_url\}\}/);
assert.match(deliveries[1].payload.headers["List-Unsubscribe"], /newsletter-unsubscribe/);

// A large edition must not silently lose the recipients beyond the first REST page.
rows = Array.from({ length: 501 }, (_, i) => toRow({ ...base, id: `pending-${i}`, status: "needs_approval" }));
rows.push(toRow(base));
deliveries = [];
assert.equal((await invoke()).body.sent, 1);
assert.ok(pages.includes("newsletter_drafts:500"));
mock.timers.setTime(new Date("2026-10-12T16:00:00Z").getTime());
assert.equal((await invoke()).body.skipped, true);
assert.equal(deliveries.length, 1, "second UTC cron must not send an hour late during DST");
mock.timers.reset();
console.log("PASS: actual cron authorization; approval and content hashes; eligibility; paginated drafts and unsubscribes; fail-closed unsubscribe errors; provider failures and release; idempotent retry; unsubscribe injection; Central send window.");
