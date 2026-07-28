# Social Media Analytics (Files Overview)

This document tracks the files that power the Social Media Analytics dashboard so you can understand which layers own data fetching, transformation, and presentation.

| File | Role |
| --- | --- |
| `supabase/functions/instagram-analytics/index.ts` | Edge Function that calls the Instagram Platform API (account metadata, insights, follower time-series, media insights) and normalizes the response into `SocialAnalyticsPayload`. Implements fault tolerance, warning aggregation, and `warnings: string[]` so the dashboard can still render partial data. |
| `src/services/socialMediaAnalytics/types.ts` | Shared TypeScript definitions (metrics, comparisons, insights, rows, the `SocialAnalyticsPayload`, and `SocialAnalyticsResponse`) that ensure the frontend and Edge Function agree on the data shape. |
| `src/services/socialMediaAnalytics/socialMediaAnalyticsService.ts` | Supabase Functions client that invokes `instagram-analytics`, surfaces errors, and exposes the extended `warnings` array along with `usedFallback`/`warning` metadata. |
| `src/pages/Admin.tsx` | Admin dashboard page that fetches the social analytics service, renders MetricCards/PlatformStats, shows social warnings via an `<Alert>`, and fills the grids/tables (content cards, recent posts, insights). |
| `src/components/admin/social-media/MetricCard.tsx` | Reusable card rendering a single overview metric with optional accent styling — used for total followers, reach, etc. |
| `src/components/admin/social-media/PlatformStatsCard.tsx` | Card that lists stat/value pairs for a platform; populates the Instagram and TikTok comparison grid. |
| `src/components/admin/social-media/TopPostCard.tsx` | Card showcasing a highlighted post (top engagement or reach) with detail copy. |
| `src/components/admin/social-media/PlatformInsightCard.tsx` | Insight card that renders label/value pairs under the “Insights” section per platform. |
| `src/components/admin/social-media/RecentPostsTable.tsx` | Table that displays recent posts (platform/date/reach/engagement) for the Social Media Analytics section. |

Use this overview whenever you need to understand or extend the analytics stack on either the frontend or backend side.
