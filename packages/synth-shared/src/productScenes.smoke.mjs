import assert from 'node:assert/strict';
import {
  PERSISTENT_PRODUCT_SCENES,
  SCENE_DC_THIS_WEEK,
  SCENE_DC_GOING_OUT,
  canAddPersistentProductScene,
  passesWarmthGate,
  meetsCoPresenceThreshold,
  normalizeProductSceneId,
  MAX_LAUNCH_PERSISTENT_SCENES,
} from './productScenes.ts';

assert.equal(PERSISTENT_PRODUCT_SCENES.length, MAX_LAUNCH_PERSISTENT_SCENES);
assert.equal(PERSISTENT_PRODUCT_SCENES[0].id, SCENE_DC_THIS_WEEK);
assert.equal(PERSISTENT_PRODUCT_SCENES[1].id, SCENE_DC_GOING_OUT);
assert.equal(normalizeProductSceneId('dc-this-week'), SCENE_DC_THIS_WEEK);
assert.equal(canAddPersistentProductScene({ activeCount: 2, thirdSceneUnlocked: false }).ok, false);
assert.equal(canAddPersistentProductScene({ activeCount: 2, thirdSceneUnlocked: true }).ok, true);
assert.equal(passesWarmthGate({ dcIcpMemberCount: 8, humanMsgs24h: 3, seedLive: false }), true);
assert.equal(passesWarmthGate({ dcIcpMemberCount: 7, humanMsgs24h: 10, seedLive: true }), false);
assert.equal(meetsCoPresenceThreshold(20), true);
assert.equal(meetsCoPresenceThreshold(19), false);
console.log('productScenes.smoke: ok');
