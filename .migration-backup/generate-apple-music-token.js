// generate-apple-music-token.js
// Run with: node generate-apple-music-token.js

import fs from 'fs';
import jwt from 'jsonwebtoken';

// ==== FILLED IN FOR YOUR PROJECT ====
const teamId = 'R6JXB945ND';      // Your Apple Developer Team ID
const keyId = 'P44PZX82GW';       // Your MusicKit Key ID
const privateKeyPath = 'C:\\Users\\Owner\\Downloads\\AuthKey_P44PZX82GW.p8'; // Full path to your .p8
// ====================================

// Read the private key
const privateKey = fs.readFileSync(privateKeyPath, 'utf8').trim();

// Issue time (now) and expiration (6 months from now)
const now = Math.floor(Date.now() / 1000);
const sixMonths = 60 * 60 * 24 * 30 * 6; // seconds

const payload = {
  iss: teamId,
  iat: now,
  exp: now + sixMonths,
  aud: 'appstoreconnect-v1',
};

const token = jwt.sign(payload, privateKey, {
  algorithm: 'ES256',
  keyid: keyId,
});

console.log('\nYour Apple Music developer token:\n');
console.log(token);
console.log('\nCopy this whole line into your env as VITE_APPLE_MUSIC_DEVELOPER_TOKEN.\n');