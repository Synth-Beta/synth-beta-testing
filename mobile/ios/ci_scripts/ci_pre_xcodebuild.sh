#!/bin/bash
# Runs immediately before xcodebuild archive on Xcode Cloud.
# Re-assert NODE_BINARY (hideShellScriptEnvironment strips PATH) and verify JS deps exist.
set -euo pipefail

REPO="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
IOS_DIR="${REPO}/mobile/ios"
MOBILE_DIR="${REPO}/mobile"

export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"
# Node tarball from ci_post_clone (either arch)
for dir in "${HOME}"/.xcode-cloud-node/node-v*-darwin-*; do
  if [[ -d "${dir}/bin" ]]; then
    export PATH="${dir}/bin:${PATH}"
  fi
done

NODE_PATH=""
for candidate in \
  "${NODE_BINARY:-}" \
  "$(command -v node 2>/dev/null || true)" \
  /opt/homebrew/bin/node \
  /usr/local/bin/node; do
  if [[ -n "${candidate}" && -x "${candidate}" ]]; then
    NODE_PATH="${candidate}"
    break
  fi
done

if [[ -z "${NODE_PATH}" ]]; then
  echo "ci_pre_xcodebuild: node not found on PATH" >&2
  exit 127
fi

(
  umask 077
  {
    printf 'export NODE_BINARY=%q\n' "${NODE_PATH}"
    # Xcode Cloud sets CI=true; some Metro/RN tooling treats that as strict mode.
    printf 'export CI=\n'
  } > "${IOS_DIR}/.xcode.env.local"
)

echo "ci_pre_xcodebuild: wrote .xcode.env.local NODE_BINARY=${NODE_PATH}"

if [[ ! -d "${MOBILE_DIR}/node_modules/expo" ]]; then
  echo "ci_pre_xcodebuild: mobile/node_modules missing — running npm ci"
  (cd "${MOBILE_DIR}" && npm ci)
fi

if [[ ! -d "${MOBILE_DIR}/node_modules/@synth/shared" ]]; then
  echo "ci_pre_xcodebuild: @synth/shared not linked — re-running npm ci" >&2
  (cd "${MOBILE_DIR}" && npm ci)
fi

if [[ ! -d "${IOS_DIR}/Pods" ]]; then
  echo "ci_pre_xcodebuild: Pods/ missing — running pod install"
  (cd "${IOS_DIR}" && pod install)
fi

if [[ ! -d "${REPO}/packages/synth-shared/src" ]]; then
  echo "ci_pre_xcodebuild: packages/synth-shared missing (monorepo file: dep)" >&2
  exit 1
fi

if [[ ! -f "${IOS_DIR}/Synth/Synth.release.entitlements" ]]; then
  echo "ci_pre_xcodebuild: Synth.release.entitlements missing (Release archive signing)" >&2
  exit 1
fi

# Smoke-test the same entry resolution the Xcode bundle phase uses.
ENTRY_FILE="$("${NODE_PATH}" -e "require('expo/scripts/resolveAppEntry')" "${MOBILE_DIR}" ios absolute 2>/dev/null | tail -n 1 || true)"
if [[ -z "${ENTRY_FILE}" || ! -f "${ENTRY_FILE}" ]]; then
  echo "ci_pre_xcodebuild: failed to resolve Expo app entry for ios bundle" >&2
  exit 1
fi
echo "ci_pre_xcodebuild: entry file OK (${ENTRY_FILE})"

CLI_PATH="$("${NODE_PATH}" --print "require.resolve('@expo/cli', { paths: [require.resolve('expo/package.json')] })" 2>/dev/null || true)"
if [[ -z "${CLI_PATH}" || ! -f "${CLI_PATH}" ]]; then
  echo "ci_pre_xcodebuild: @expo/cli not resolvable from mobile/" >&2
  exit 1
fi
echo "ci_pre_xcodebuild: @expo/cli OK"

# Release archive bundles JS via react-native-xcode.sh + export:embed (NOT plain `expo export`).
if [[ -f "${MOBILE_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${MOBILE_DIR}/.env"
  set +a
fi

SMOKE_DIR="${TMPDIR:-/tmp}/synth-xcode-cloud-embed-smoke"
rm -rf "${SMOKE_DIR}"
mkdir -p "${SMOKE_DIR}/Release-iphoneos/Synth.app"

export CONFIGURATION=Release
export CONFIGURATION_BUILD_DIR="${SMOKE_DIR}/Release-iphoneos"
export UNLOCALIZED_RESOURCES_FOLDER_PATH="Synth.app"
export TARGET_BUILD_DIR="${CONFIGURATION_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}"
export PLATFORM_NAME=iphoneos
export PROJECT_DIR="${IOS_DIR}"
export PROJECT_ROOT="${MOBILE_DIR}"
export PODS_ROOT="${IOS_DIR}/Pods"
export SRCROOT="${IOS_DIR}"
export DEV=false
export NODE_BINARY="${NODE_PATH}"
export CI=
export NODE_ENV=production
export ENTRY_FILE="${ENTRY_FILE}"
export CLI_PATH="${CLI_PATH}"
export BUNDLE_COMMAND=export:embed

RN_XCODE="${MOBILE_DIR}/node_modules/react-native/scripts/react-native-xcode.sh"
if [[ ! -f "${RN_XCODE}" ]]; then
  echo "ci_pre_xcodebuild: react-native-xcode.sh missing at ${RN_XCODE}" >&2
  exit 1
fi

echo "ci_pre_xcodebuild: smoke export:embed (same path as xcodebuild archive)..."
bash "${RN_XCODE}"
echo "ci_pre_xcodebuild: smoke export:embed OK"

echo "ci_pre_xcodebuild: ready for xcodebuild archive"
