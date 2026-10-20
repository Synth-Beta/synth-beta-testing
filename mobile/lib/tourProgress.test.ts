// Run: npx tsx lib/tourProgress.test.ts
import assert from 'node:assert/strict';
import { advanceTour, getTour, isTaskStep, onTourAction, reportTourAction, startTour } from './tourProgress';

// Signed in: 5 steps, two of them live tasks.
startTour(true);
assert.deepEqual(getTour(), { step: 'feed', next: 'save', index: 0, total: 5 });
assert.equal(isTaskStep(getTour()!.next), true);

// An action only counts on its own task step.
let heard = 0;
const off = onTourAction(() => heard++);
assert.equal(reportTourAction('interested'), false); // still on a slide
assert.equal(advanceTour(), 'save');
assert.equal(reportTourAction('review'), false); // wrong action
assert.equal(reportTourAction('interested'), true);
assert.equal(heard, 1);
off();

assert.equal(advanceTour(), 'community');
assert.equal(advanceTour(), 'review');
assert.equal(advanceTour(), 'profile');
assert.equal(advanceTour(), null); // past the end: tour over
assert.equal(getTour(), null);
assert.equal(reportTourAction('review'), false); // no tour, nothing to report

// Signed out: no tasks.
startTour(false);
assert.equal(getTour()!.total, 4);
const steps: (string | null)[] = [getTour()!.step];
for (let s = advanceTour(); s; s = advanceTour()) steps.push(s);
assert.equal(steps.some((s) => isTaskStep(s as any)), false);

console.log('tourProgress ok');
