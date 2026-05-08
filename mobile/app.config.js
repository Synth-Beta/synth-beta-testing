// Dynamic Expo config wrapper.
//
// We keep the canonical config in `app.json`, but conditionally attach
// Android `googleServicesFile` only when the file is present. This avoids
// breaking local/dev builds for contributors who haven't added Firebase yet.
const fs = require('fs');
const path = require('path');

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
    android: {
      ...(expo.android ?? {}),
      ...(hasGoogleServices ? { googleServicesFile: './google-services.json' } : {}),
    },
  };
}

module.exports = getExpoConfig;

