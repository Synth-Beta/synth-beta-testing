import {
  DEFAULT_SETTINGS,
  DestinationModeSchema,
  type DestinationMode,
  type SceneGuidesRuntimeSettings,
} from './types.js';

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

export function loadEnvSettings(
  overrides: Partial<SceneGuidesRuntimeSettings> = {},
): SceneGuidesRuntimeSettings {
  const modeRaw = process.env.AI_SCENE_GUIDES_MODE ?? DEFAULT_SETTINGS.mode;
  const modeParsed = DestinationModeSchema.safeParse(modeRaw);
  const mode: DestinationMode = modeParsed.success ? modeParsed.data : 'fixture';

  return {
    ...DEFAULT_SETTINGS,
    enabled: envBool('AI_SCENE_GUIDES_ENABLED', false),
    dryRun: !envBool('AI_SCENE_GUIDES_ENABLED', false) || mode === 'fixture',
    mode,
    setlistGenerationEnabled: envBool('AI_SCENE_GUIDES_SETLIST_ENABLED', false),
    ...overrides,
  };
}

/** Fail closed: production posting requires env + settings both enabled and mode production/staff. */
export function canWriteToSynthMessages(settings: SceneGuidesRuntimeSettings): boolean {
  if (!settings.enabled) return false;
  if (settings.dryRun) return false;
  if (settings.mode === 'fixture' || settings.mode === 'shadow_slack') return false;
  return settings.mode === 'staff_approve' || settings.mode === 'production';
}

export function canDeliverToSlack(settings: SceneGuidesRuntimeSettings): boolean {
  if (!settings.enabled && settings.mode !== 'shadow_slack') {
    // Allow shadow when mode is explicitly shadow even if global enabled is being toggled via pause
  }
  return settings.mode === 'shadow_slack';
}

export function getJamBaseCredentials(): { apiKey: string; userAgent: string } | null {
  const apiKey = process.env.JAMBASE_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    userAgent:
      process.env.JAMBASE_USER_AGENT?.trim() ||
      'SynthAISceneGuides/1.0 (getsynth.app; contact=ops@getsynth.app)',
  };
}

export function getRedditCredentials(): {
  clientId: string;
  clientSecret: string;
  userAgent: string;
} | null {
  const clientId = process.env.REDDIT_CLIENT_ID?.trim();
  const clientSecret = process.env.REDDIT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    userAgent: process.env.REDDIT_USER_AGENT?.trim() || 'SynthAISceneGuides/1.0 by Synth',
  };
}

export function getOpenAiConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.OPENAI_SCENE_GUIDES_MODEL?.trim() || 'gpt-4o-mini',
  };
}

export function getShadowSlackConfig(): {
  botToken: string;
  signingSecret: string;
  feedChannelId: string;
  alertsChannelId: string;
  dailyChannelId: string;
  reviewerAllowlist: string[];
} | null {
  const botToken = process.env.AI_SHADOW_SLACK_BOT_TOKEN?.trim();
  const signingSecret = process.env.AI_SHADOW_SLACK_SIGNING_SECRET?.trim();
  const feedChannelId = process.env.AI_SHADOW_SLACK_FEED_CHANNEL_ID?.trim();
  const alertsChannelId = process.env.AI_SHADOW_SLACK_ALERTS_CHANNEL_ID?.trim();
  const dailyChannelId = process.env.AI_SHADOW_SLACK_DAILY_CHANNEL_ID?.trim();
  if (!botToken || !signingSecret || !feedChannelId || !alertsChannelId || !dailyChannelId) {
    return null;
  }
  const reviewerAllowlist = (process.env.AI_SHADOW_REVIEWER_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    botToken,
    signingSecret,
    feedChannelId,
    alertsChannelId,
    dailyChannelId,
    reviewerAllowlist,
  };
}
