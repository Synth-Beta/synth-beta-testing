import assert from "node:assert/strict";
import { aggregateNewsletterSections, draftContainsSection } from "./sections";

const drafts = [
  {
    id: "d1",
    user_id: "u1",
    email: "one@example.com",
    status: "needs_approval",
    sources: [
      { kind: "news", label: "Football watch platforms", url: "https://example.com/football" },
      { kind: "event", label: "Phish at MSG", url: "https://tickets.example/phish" },
    ],
  },
  {
    id: "d2",
    user_id: "u2",
    email: "two@example.com",
    status: "needs_approval",
    sources: [
      { kind: "news", label: "Football watch platforms", url: "https://example.com/football" },
    ],
  },
  {
    id: "d3",
    user_id: "u3",
    email: "three@example.com",
    status: "needs_approval",
    sources: [
      { kind: "listen", label: "Artist, Track", url: "https://example.com/listen" },
    ],
  },
];

const sections = aggregateNewsletterSections(drafts, new Map(), new Set());
assert.equal(sections[0]?.label, "Football watch platforms");
assert.equal(sections[0]?.usageCount, 2);
assert.equal(sections[0]?.status, "pending");
assert.equal(sections.at(-1)?.usageCount, 1);
assert.equal(sections.length, 3);

const approved = aggregateNewsletterSections(
  drafts,
  new Map([["https://example.com/football", "approved"]]),
  new Set(),
);
assert.equal(approved[0]?.status, "approved");

const rejected = aggregateNewsletterSections(
  drafts,
  new Map(),
  new Set(["https://example.com/football"]),
);
assert.equal(rejected[0]?.status, "rejected");

assert.equal(draftContainsSection(drafts[0], ["https://example.com/football"]), true);
assert.equal(draftContainsSection(drafts[2], ["https://example.com/football"]), false);

console.log("sections.test.ts: ok");
