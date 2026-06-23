// Dynamic Expo config wrapper.
//
// We keep the canonical config in `app.json`, but:
// - Attach Android `googleServicesFile` only when the file is present.
// - Set expo-notifications APNs mode per EAS profile (production vs sandbox).
const fs = require('fs');
const path = require('path');

function getNotificationsApnsMode() {
  // EAS sets EAS_BUILD_PROFILE to development | preview | production.
  // Xcode Cloud / local dev: default to sandbox (matches Synth.entitlements).
  return process.env.EAS_BUILD_PROFILE === 'production' ? 'production' : 'development';
}

function applyNotificationsPluginMode(plugins) {
  const mode = getNotificationsApnsMode();

  return plugins.map((plugin) => {
    if (plugin === 'expo-notifications') {
      return ['expo-notifications', { mode }];
    }

    if (Array.isArray(plugin) && plugin[0] === 'expo-notifications') {
      const [, options = {}] = plugin;
      return ['expo-notifications', { ...options, mode }];
    }

    return plugin;
  });
}

/** @type {import('@expo/config').ExpoConfig} */
function getExpoConfig() {
  const appJsonPath = path.join(__dirname, 'app.json');
  const appJsonRaw = fs.readFileSync(appJsonPath, 'utf8');
  const appJson = JSON.parse(appJsonRaw);
  const expo = appJson?.expo ?? {};

  const googleServicesPath = path.join(__dirname, 'google-services.json');
  const hasGoogleServices = fs.existsSync(googleServicesPath);

  return {
    ...expo,
    ios: {
      ...(expo.ios ?? {}),
      // iPhone-only App Store binary (no iPad screenshot requirements).
      supportsTablet: false,
    },
    android: {
      ...(expo.android ?? {}),
      ...(hasGoogleServices ? { googleServicesFile: './google-services.json' } : {}),
    },
    plugins: applyNotificationsPluginMode(expo.plugins ?? []),
  };
}

module.exports = getExpoConfig;
