// Run: npx tsx lib/tourProgress.test.ts
import assert from 'node:assert/strict';
import { advanceTour, getTour, isTaskStep, onTourAction, reportTourAction, startTour } from './tourProgress';

// 6 steps on the real screens, two of them live tasks.
startTour();
assert.deepEqual(getTour(), { step: 'feed', next: 'save', index: 0, total: 6 });
assert.equal(isTaskStep(getTour()!.next), true);

// An action only counts on its own task step.
let heard = 0;
const off = onTourAction(() => heard++);
assert.equal(reportTourAction('interested'), false); // still on an info step
assert.equal(advanceTour(), 'save');
assert.equal(reportTourAction('review'), false); // wrong action
assert.equal(reportTourAction('interested'), true);
assert.equal(heard, 1);

assert.equal(advanceTour(), 'community');
assert.equal(advanceTour(), 'review');
assert.equal(reportTourAction('review'), true);
assert.equal(heard, 2);
off();

assert.equal(advanceTour(), 'messages');
assert.equal(advanceTour(), 'profile');
assert.equal(isTaskStep('profile'), false);
assert.equal(advanceTour(), null); // past the end: tour over
assert.equal(getTour(), null);
assert.equal(reportTourAction('review'), false); // no tour, nothing to report

// Replaying from Settings starts over at step 1.
startTour();
assert.equal(getTour()!.step, 'feed');

console.log('tourProgress ok');
