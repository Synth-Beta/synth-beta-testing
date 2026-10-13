# Synth ↔ Pick Five account linking

## 1. Redirect (Synth → Pick Five)

Your connect page: `https://pick5.io/connect/synth`. Synth opens it with the system URL opener (never an in-app browser), so the Pick Five app opens when installed.

When a user taps **Connect Pick Five** in Synth, Synth sends them to that page and adds a one-time code to the end:

```
https://pick5.io/connect/synth?code=K7PQ2MXA
```

Read `code` from the URL.

On that page:
1. Make sure the user is signed in to Pick Five. If they aren't, sign them in and keep the `code`.
2. Call `redeem` (below) from your server with the code and your per-link UUID as `partner_user_id`.
3. Show "Connected to Synth" and send the user back with the Synth link (section 3).

The code is 8 characters (`A–Z` without `I`/`O`, and `2–9`). It expires after 10 minutes and works only once. Never call `redeem` from the browser, because the key must stay on your server.

## 2. API (your server → Synth)

Base URL: `https://join.getsynth.app/api/partner/link/`

Headers on every call:

```
Content-Type: application/json
X-Partner-Id: pickfive
X-Partner-Key: <key>
```

### POST `redeem`

Request:
```json
{ "code": "K7PQ2MXA", "partner_user_id": "<Pick Five user id>" }
```

Response `200`:
```json
{ "user_id": "<Synth user id>", "link_token": "<random string>" }
```

Store `user_id` and `link_token` with the Pick Five user. Both apps keep the same `link_token` for this link.

### POST `revoke`

Call this when a user disconnects in Pick Five.

Request:
```json
{ "partner_user_id": "<Pick Five user id>" }
```

Response `200`:
```json
{ "revoked": 1 }
```

### Errors

Error responses have the body `{ "error": "<message>" }`.

| Status | Meaning |
|---|---|
| `400` | A required field is missing |
| `401` | Wrong or missing key |
| `404` | Code is invalid, used or expired |

## 3. Synth link (Pick Five → Synth)

```
https://join.getsynth.app/connect/pickfive
```

This opens the Synth app on the Connect Pick Five screen when it's installed, and the Synth website's Pick Five settings otherwise. Use it for your Connect button and to send users back after linking. The app's URL scheme also works: `synth://connect/pickfive`.

## 4. Disconnect in Synth (Synth → your server)

When a user disconnects in Synth, Synth calls your endpoint:

```
POST <your API base>/partner/link/revoke
Content-Type: application/json
X-Partner-Id: synth
X-Partner-Key: <key you generate and send us>

{ "partner_user_id": "<Synth user id>" }
```

`partner_user_id` is the Synth `user_id` you stored from `redeem`. Return `200`. If the call fails, Synth still disconnects on its side.

Send us `<your API base>` and the key.
