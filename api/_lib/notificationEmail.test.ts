/**
 * Run: node --experimental-strip-types --test api/_lib/notificationEmail.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNotificationEmail, groupEmailRecipients } from './notificationEmail.ts';

const links = { appUrl: 'https://getsynth.app', appStoreUrl: 'https://apps.apple.com/x', unsubscribeUrl: 'https://u.test/?t=1' };

test('one notification: its title is the subject and the body escapes HTML', () => {
  const { subject, html } = buildNotificationEmail({
    items: [{ title: 'Boygenius <announced>', message: 'Show at "MSG" & more' }],
    ...links,
  });
  assert.equal(subject, 'Boygenius <announced>');
  assert.ok(html.includes('Boygenius &lt;announced&gt;'));
  assert.ok(html.includes('Show at &quot;MSG&quot; &amp; more'));
  assert.ok(!html.includes('<announced>'));
  assert.ok(html.includes(links.unsubscribeUrl) && html.includes(links.appStoreUrl) && html.includes(links.appUrl));
});

test('several notifications: count subject, at most 5 listed', () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ title: `T${i}`, message: `M${i}` }));
  const { subject, html } = buildNotificationEmail({ items, ...links });
  assert.equal(subject, '7 new updates on Synth');
  assert.ok(html.includes('T4') && !html.includes('T5'));
});

test('groups by user, skipping users with a push token, unsubscribed, bots, or no email', () => {
  const notifs = [
    { id: 'n1', user_id: 'web', title: 'a', message: 'x' },
    { id: 'n2', user_id: 'web', title: 'b', message: 'y' },
    { id: 'n3', user_id: 'ios', title: 'c', message: 'z' },
    { id: 'n4', user_id: 'unsub', title: 'd', message: 'w' },
    { id: 'n5', user_id: 'bot', title: 'e', message: 'v' },
    { id: 'n6', user_id: 'noemail', title: 'f', message: 'u' },
  ];
  const users = [
    { user_id: 'web', email: 'Web@X.com ', is_bot: false },
    { user_id: 'ios', email: 'ios@x.com', is_bot: false },
    { user_id: 'unsub', email: 'unsub@x.com', is_bot: null },
    { user_id: 'bot', email: 'bot@x.com', is_bot: true },
    { user_id: 'noemail', email: null, is_bot: false },
  ];
  const out = groupEmailRecipients(notifs, users, new Set(['ios']), new Set(['unsub@x.com']));
  assert.deepEqual(out, [{ userId: 'web', email: 'web@x.com', notifications: [notifs[0], notifs[1]] }]);
});
