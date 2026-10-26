import assert from "node:assert/strict";
import { mock } from "node:test";
import handler from "../../../api/_lib/cron/newsletterSend";
import { brevoPayload, sendBrevoNewsletter } from "../../../api/_lib/brevoNewsletter";
import { contentHash, deliveryKey, deliverApprovedDrafts, planSend, type StoredDraft } from "../../../api/_lib/newsletterDelivery";

const hash = await contentHash("Subject", '<a href="{{unsubscribe_url}}" style="color:#8A8F98;text-decoration:underline;">Unsubscribe</a>');
const base: StoredDraft = { id: "draft", editionDate: "2026-10-12", userId: "user", email: "user@example.com", subject: "Subject", html: '<a href="{{unsubscribe_url}}" style="color:#8A8F98;text-decoration:underline;">Unsubscribe</a>', contentHash: hash, approvedContentHash: hash, status: "approved", sentAt: null };
assert.deepEqual(planSend([{ ...base, status: "needs_approval" }, base], new Set()).send, [base]);
let claims = 0;
const corrupt = await deliverApprovedDrafts({ drafts: [{ ...base, html: "unreviewed replacement" }], unsubscribedEmails: new Set(), claim: async () => { claims++; return true; }, sendEmail: async () => { throw new Error("Must never send"); }, release: async () => {} });
assert.equal(claims, 0);
assert.match(corrupt.skip[0].reason, /stored content/);

const sampleMessage = { to: "user@example.com", subject: "Subject", html: "<p>Hello</p>", unsubscribeUrl: "https://newsletter-test.invalid/unsubscribe", deliveryKey: "newsletter:2026-10-12:draft:abc" };
const directPayload = brevoPayload(sampleMessage);
assert.equal(directPayload.sender.name, "The Synth Setlist");
assert.equal(directPayload.sender.email, "synth.no.reply@getsynth.app");
assert.equal("replyTo" in directPayload, false);
assert.equal(directPayload.htmlContent, "<p>Hello</p>");
assert.equal(directPayload.headers["X-Mailin-custom"], sampleMessage.deliveryKey);
globalThis.fetch = async () => Response.json({ message: "rejected test-only-provider" }, { status: 400 });
await assert.rejects(sendBrevoNewsletter("test-only-provider", sampleMessage), (error: Error) => {
  assert.equal(error.name, "DeliveryRejectedError");
  assert.doesNotMatch(error.message, /test-only-provider/);
  return true;
});
globalThis.fetch = async () => { throw new DOMException("The operation was aborted", "TimeoutError"); };
await assert.rejects(sendBrevoNewsletter("test-only-provider", sampleMessage), (error: Error) => {
  assert.equal(error.name, "DeliveryUncertainError");
  assert.match(error.message, /Acceptance was not confirmed/);
  return true;
});

const toRow = (draft: StoredDraft) => ({ id: draft.id, edition_date: draft.editionDate, user_id: draft.userId, email: draft.email, subject: draft.subject, html: draft.html, content_hash: draft.contentHash, approved_content_hash: draft.approvedContentHash, status: draft.status, sent_at: draft.sentAt, brevo_message_id: draft.brevoMessageId ?? null, delivery_state: draft.deliveryState ?? null, send_claimed_at: draft.sendClaimedAt ?? null });
let rows = [toRow(base)];
let unsubscribes: any[] = [];
let eligible = [{ user_id: base.userId, email: base.email }];
let unsubscribeFailure = false;
let providerMode: "ok" | "reject" | "timeout" | "no-id" = "ok";
let deliveries: Array<{ key: string | null; payload: any; apiKey: string | null }> = [];
let mutations: any[] = [];
const pages: string[] = [];
const rowIdFrom = (url: URL) => {
  const id = url.searchParams.get("id");
  return id?.startsWith("eq.") ? id.slice(3) : id;
};
globalThis.fetch = async (input: any, init?: RequestInit) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "api.brevo.com") {
    const headers = new Headers(init?.headers);
    const payload = JSON.parse(String(init?.body));
    deliveries.push({ key: payload.headers?.["X-Mailin-custom"] ?? null, payload, apiKey: headers.get("api-key") });
    if (providerMode === "timeout") throw new DOMException("The operation was aborted", "TimeoutError");
    if (providerMode === "reject") return Response.json({ code: "invalid_parameter", message: "Invalid sender test-only-provider" }, { status: 400 });
    if (providerMode === "no-id") return Response.json({}, { status: 201 });
    return Response.json({ messageId: "<brevo-message>" }, { status: 201 });
  }
  const table = url.pathname.split("/").at(-1)!;
  if (init?.method === "PATCH") {
    const update = JSON.parse(String(init.body));
    mutations.push(update);
    const id = rowIdFrom(url);
    const row = rows.find((item) => item.id === id);
    if (row) Object.assign(row, update);
    const claimed = typeof update.send_claimed_at === "string";
    const recorded = typeof update.brevo_message_id === "string" && update.brevo_message_id.length > 0;
    const markedSent = update.status === "sent";
    return Response.json(claimed || recorded || markedSent ? [{ id: row?.id ?? id ?? base.id }] : []);
  }
  if (table === "newsletter_unsubscribes" && unsubscribeFailure) return Response.json({ message: "Subscription database unavailable" }, { status: 500 });
  const list = table === "newsletter_drafts" ? rows : table === "users" ? eligible : table === "newsletter_unsubscribes" ? unsubscribes : [];
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 500);
  pages.push(`${table}:${offset}`);
  return Response.json(list.slice(offset, offset + limit));
};

for (const [name, value] of Object.entries({ CRON_SECRET: "test-only-cron", SUPABASE_URL: "https://newsletter-test.invalid", SUPABASE_SERVICE_ROLE_KEY: "test-only-service", BREVO_API_KEY: "test-only-provider", NEWSLETTER_UNSUBSCRIBE_SECRET: "test-only-signing" })) process.env[name] = value;
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_FROM_EMAIL;
// Monday 2026-10-12 10:00 America/New_York (EDT) = 14:00 UTC
mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-12T14:00:00Z").getTime() });
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
providerMode = "reject";
const failed = await invoke();
assert.equal(failed.code, 502);
assert.equal(failed.body.failed, 1);
assert.equal(failed.body.sent, 0);
assert.equal(JSON.stringify(failed.body).includes("test-only-provider"), false);
assert.equal(JSON.stringify(mutations).includes("test-only-provider"), false);
assert.ok(mutations.some((mutation) => mutation.delivery_state === "failed" && mutation.send_claimed_at === null));
assert.equal(mutations.some((mutation) => typeof mutation.brevo_message_id === "string"), false);
rows = [toRow(base)];
providerMode = "ok";
const sent = await invoke();
assert.equal(sent.code, 200);
assert.equal(sent.body.sent, 1);
assert.equal(deliveries[0].key, deliveryKey(base));
assert.equal(deliveries[1].key, deliveries[0].key, "retry must use the same provider key");
assert.equal(deliveries[1].payload.sender.email, "synth.no.reply@getsynth.app");
assert.equal(deliveries[1].payload.sender.name, "The Synth Setlist");
assert.equal("replyTo" in deliveries[1].payload, false);
assert.equal(deliveries[1].apiKey, "test-only-provider");
assert.doesNotMatch(JSON.stringify(deliveries[1].payload), /test-only-provider/);
assert.doesNotMatch(deliveries[1].payload.htmlContent, /\{\{unsubscribe_url\}\}/);
assert.match(deliveries[1].payload.headers["List-Unsubscribe"], /newsletter-unsubscribe/);
assert.ok(mutations.some((mutation) => mutation.brevo_message_id === "<brevo-message>" && mutation.delivery_state === "accepted"));
const beforeTimeout = deliveries.length;
providerMode = "timeout";
rows = [toRow(base)];
const timedOut = await invoke();
assert.equal(timedOut.code, 502);
assert.equal(timedOut.body.uncertain, 1);
assert.equal(timedOut.body.sent, 0);
assert.ok(mutations.some((mutation) => mutation.delivery_state === "uncertain"));
const retried = await invoke();
assert.equal(retried.body.sent, 0);
assert.equal(deliveries.length, beforeTimeout + 1, "an unconfirmed timeout must not be sent again");
providerMode = "ok";
rows = [toRow(base)];

// A large edition must not silently lose the recipients beyond the first REST page.
rows = Array.from({ length: 501 }, (_, i) => toRow({ ...base, id: `pending-${i}`, status: "needs_approval" }));
rows.push(toRow(base));
deliveries = [];
assert.equal((await invoke()).body.sent, 1);
assert.ok(pages.includes("newsletter_drafts:500"));
mock.timers.setTime(new Date("2026-10-12T15:00:00Z").getTime());
assert.equal((await invoke()).body.skipped, true);
assert.equal(deliveries.length, 1, "second UTC cron must not send an hour late during DST");
mock.timers.setTime(new Date("2026-10-13T14:00:00Z").getTime());
assert.equal((await invoke()).body.skipped, true, "non-Monday must not send");
mock.timers.reset();
console.log("PASS: actual cron authorization; approval and content hashes; eligibility; paginated drafts and unsubscribes; fail-closed unsubscribe errors; provider failures and release; idempotent retry; unsubscribe injection; Eastern Monday send window.");
