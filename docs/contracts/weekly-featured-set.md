# Weekly featured set contract (LOI-566)

**Goal:** [Ship and grow Synth and CareerMCP as owned products](/LOI/goals/782fab5d-f33a-4c72-8a38-7b9fcb39b8cc)  
**Source of truth:** `weekly_featured_sets` + `weekly_featured_items` (Supabase)  
**Consumers:** Home, Discover, featured-show chat provisioning  
**Editors:** admin / DC Live Music Curator via admin pin API (no app release)

## Density

| Rule | Value |
| --- | --- |
| Metro | `dc` |
| Week clock | America/New_York, Monday start |
| Week id | `YYYY-Www` (ISO-like from Monday) |
| Hard min / max | 10 / 15 |
| Default target | 12 |
| Genres | Mixed within the week (publish rejects a single genre) |

## Read API

`GET /api/featured/week?weekId=&metro=dc`

Response (`contractVersion: 1`):

```json
{
  "contractVersion": 1,
  "metro": "dc",
  "weekId": "2026-W35",
  "empty": false,
  "density": { "min": 10, "max": 15, "target": 12 },
  "set": {
    "setId": "uuid",
    "weekStartDate": "2026-08-24",
    "status": "published",
    "targetCount": 12,
    "publishedAt": "…",
    "updatedAt": "…",
    "showCount": 12
  },
  "shows": [
    {
      "eventId": "uuid",
      "position": 1,
      "genre": "indie",
      "curatorNote": null,
      "chatProvisionKey": "featured_show:2026-W35:<eventId>",
      "title": "…",
      "artistName": "…",
      "venueName": "…",
      "venueCity": "Washington",
      "eventDate": "…",
      "imageUrl": "…",
      "eventGenres": ["indie"]
    }
  ]
}
```

Client SDK (same SoT): `fetchWeeklyFeaturedSet()` / `fetchDemoWeeklyFeaturedSet()` in `src/services/weeklyFeaturedService.ts` (and Expo `mobile/src/services/weeklyFeaturedService.ts`).

Demo wire ([LOI-646](/LOI/issues/LOI-646)): Home + Discover request `weekId=2026-W35` (`DEMO_FEATURED_WEEK_ID`). Empty / unpublished / wrong-week responses render the curated empty state (no hard-coded pin list, no other-week fallback).

RPC: `get_weekly_featured_set(p_metro, p_week_id)`.

## Write / edit path (no app release)

`PUT /api/admin/featured/week`  
Auth: Bearer token for `users.account_type = admin`

```json
{
  "weekId": "2026-W35",
  "weekStartDate": "2026-08-24",
  "status": "published",
  "targetCount": 12,
  "notes": "Mixed indie / hip-hop / jazz midweek",
  "pins": [
    { "eventId": "uuid", "position": 1, "genre": "indie" },
    { "eventId": "uuid", "position": 2, "genre": "hip-hop" }
  ]
}
```

Draft: `status: "draft"` allows 0-15 pins.  
Publish: requires 10-15 pins and more than one distinct genre.

Also available from authenticated admin clients via `replaceWeeklyFeaturedPins` / `publishWeeklyFeaturedSet`.

## Chat provisioning

Use `chatProvisionKey` = `featured_show:{weekId}:{eventId}` when opening or creating a featured-show chat. Messages tickets should key rooms off this string.

## Migration

`supabase/migrations/20260825120000_weekly_featured_sets.sql`

Apply before demo week. Until a published set exists, Home/Discover show the curated empty state (not a metro catalog dump).
