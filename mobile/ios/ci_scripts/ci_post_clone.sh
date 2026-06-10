#!/bin/bash
# Xcode Cloud runs this after clone, before xcodebuild.
# Expo/RN need mobile/node_modules for the Podfile and the "Bundle React Native code" phase.
#
# CocoaPods: set XCODE_CLOUD_POD_USE_GIT_SPECS=1 in the workflow to use the git specs repo only
# (skips cdn.cocoapods.org). Otherwise we retry the CDN, then auto-fallback to git specs if needed.
#
# Xcode Cloud images often do not expose `npm` on PATH; Node may still exist under Homebrew
# or must be installed (brew or official tarball).
set -euo pipefail

REPO="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
echo "ci_post_clone: REPO=${REPO}"

GIT_SHA="$(git -C "${REPO}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
GIT_FULL="$(git -C "${REPO}" rev-parse HEAD 2>/dev/null || echo unknown)"
echo "ci_post_clone: git ${GIT_SHA} (${GIT_FULL})"
echo "ci_post_clone: After TestFlight install, confirm the build matches this commit (Xcode Cloud build logs / App Store Connect)."

# RN 0.83 / Metro 0.83 require Node >= 20.19.4 (see npm EBADENGINE in mobile deps).
XCODE_CLOUD_NODE_MIN_VERSION="${XCODE_CLOUD_NODE_MIN_VERSION:-20.19.4}"
XCODE_CLOUD_NODE_VERSION="${XCODE_CLOUD_NODE_VERSION:-20.19.4}"

node_version_meets_minimum() {
  local node_bin="${1:-node}"
  "${node_bin}" -e "
    const min = process.env.XCODE_CLOUD_NODE_MIN_VERSION.split('.').map(Number);
    const cur = process.versions.node.split('.').map(Number);
    const ok =
      cur[0] > min[0] ||
      (cur[0] === min[0] &&
        (cur[1] > min[1] || (cur[1] === min[1] && cur[2] >= min[2])));
    process.exit(ok ? 0 : 1);
  " 2>/dev/null
}

ensure_npm() {
  export XCODE_CLOUD_NODE_MIN_VERSION

  # Apple Silicon + Intel Homebrew locations (not always on default PATH).
  export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"

  if command -v npm >/dev/null 2>&1 && node_version_meets_minimum; then
    echo "ci_post_clone: found npm at $(command -v npm) ($(node -v))"
    return 0
  fi

  if command -v npm >/dev/null 2>&1; then
    echo "ci_post_clone: npm on PATH is too old ($(node -v)); need >= ${XCODE_CLOUD_NODE_MIN_VERSION}" >&2
  fi

  # Prior tarball install from an earlier ci_post_clone on this worker (skip if too old).
  for prior_dir in "${HOME}"/.xcode-cloud-node/node-v*-darwin-*; do
    if [[ -x "${prior_dir}/bin/npm" ]] && node_version_meets_minimum "${prior_dir}/bin/node"; then
      export PATH="${prior_dir}/bin:${PATH}"
      echo "ci_post_clone: found npm from prior tarball at ${prior_dir}/bin/npm ($(node -v))"
      return 0
    fi
  done

  # Official Node binary from nodejs.org — preferred on Xcode Cloud because
  # `brew install node` pulls dozens of bottles from ghcr.io (often unreachable).
  local ver arch dir attempt max_attempts wait_seconds
  ver="${XCODE_CLOUD_NODE_VERSION}"
  arch="$(uname -m)"
  case "${arch}" in
    arm64) arch=arm64 ;;
    x86_64) arch=x64 ;;
    *)
      echo "ci_post_clone: unsupported arch $(uname -m)" >&2
      exit 1
      ;;
  esac

  dir="${HOME}/.xcode-cloud-node/node-v${ver}-darwin-${arch}"
  max_attempts="${XCODE_CLOUD_NODE_DOWNLOAD_ATTEMPTS:-5}"
  wait_seconds="${XCODE_CLOUD_NODE_DOWNLOAD_RETRY_WAIT:-15}"

  echo "ci_post_clone: npm missing; installing Node ${ver} (${arch}) from nodejs.org..."
  mkdir -p "${HOME}/.xcode-cloud-node"

  attempt=1
  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    echo "ci_post_clone: Node download attempt ${attempt}/${max_attempts}..."
    if curl -fsSL --max-time 180 --retry 3 --retry-delay 5 \
      "https://nodejs.org/dist/v${ver}/node-v${ver}-darwin-${arch}.tar.gz" \
      -o /tmp/xcode-cloud-node.tgz; then
      rm -rf "${dir}"
      tar -xzf /tmp/xcode-cloud-node.tgz -C "${HOME}/.xcode-cloud-node"
      rm -f /tmp/xcode-cloud-node.tgz
      export PATH="${dir}/bin:${PATH}"
      if command -v npm >/dev/null 2>&1 && node_version_meets_minimum; then
        echo "ci_post_clone: Node tarball install OK (${dir}, $(node -v))"
        return 0
      fi
      echo "ci_post_clone: tarball extracted but npm missing or Node too old in ${dir}/bin" >&2
    fi
    if [[ "${attempt}" -lt "${max_attempts}" ]]; then
      echo "ci_post_clone: Node download failed; retrying in ${wait_seconds}s..."
      sleep "${wait_seconds}"
    fi
    attempt=$((attempt + 1))
  done

  # Last resort only — Homebrew depends on ghcr.io and often fails on Xcode Cloud.
  if command -v brew >/dev/null 2>&1; then
    echo "ci_post_clone: nodejs.org tarball failed; trying Homebrew (may fail if ghcr.io is blocked)..."
    export HOMEBREW_NO_AUTO_UPDATE=1
    export HOMEBREW_NO_ENV_HINTS=1
    if brew install node; then
      hash -r || true
      if command -v npm >/dev/null 2>&1 && node_version_meets_minimum; then
        echo "ci_post_clone: Homebrew node install OK ($(node -v))"
        return 0
      fi
    fi
    echo "ci_post_clone: Homebrew node install failed" >&2
  fi

  echo "ci_post_clone: could not install Node/npm (nodejs.org and Homebrew both failed)" >&2
  exit 127
}

ensure_npm
command -v npm >/dev/null 2>&1 || { echo "ci_post_clone: npm still not available after setup" >&2; exit 127; }

echo "ci_post_clone: node $(node -v), npm $(npm -v)"

# xcodebuild runs with -hideShellScriptEnvironment; RN bundle scripts need NODE_BINARY on disk.
NODE_PATH="$(command -v node)"
if [[ -z "${NODE_PATH}" || ! -x "${NODE_PATH}" ]]; then
  echo "ci_post_clone: node executable not found after ensure_npm" >&2
  exit 127
fi
(
  umask 077
  {
    printf 'export NODE_BINARY=%q\n' "${NODE_PATH}"
    printf 'export CI=false\n'
  } > "${REPO}/mobile/ios/.xcode.env.local"
)
echo "ci_post_clone: wrote mobile/ios/.xcode.env.local (NODE_BINARY=${NODE_PATH})"

echo "ci_post_clone: iOS App ID com.tejpatel.synth must have these capabilities enabled for export (exit 70 if missing):"
echo "ci_post_clone:   Push Notifications | Sign in with Apple | Associated Domains"
echo "ci_post_clone:   https://developer.apple.com/account/resources/identifiers"
echo "ci_post_clone: If export fails after archive, revoke expired 'Managed (Xcode Cloud)' certs and start a NEW build."
echo "ci_post_clone: Optional one-time: eas build -p ios --profile production (syncs capabilities; requires EXPO_TOKEN)."

cd "${REPO}/mobile"

# Expo inlines EXPO_PUBLIC_* at bundle time; Xcode Cloud does not load a local .env.
# Configure these as encrypted workflow environment variables in App Store Connect
# (same names), or they will be inherited if exported by the runner.
if [[ -n "${EXPO_PUBLIC_SUPABASE_URL:-}" && -n "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  echo "ci_post_clone: writing mobile/.env from Xcode Cloud env (Supabase)"
  (
    umask 077
    {
      printf '%s\n' "EXPO_PUBLIC_SUPABASE_URL=${EXPO_PUBLIC_SUPABASE_URL}"
      printf '%s\n' "EXPO_PUBLIC_SUPABASE_ANON_KEY=${EXPO_PUBLIC_SUPABASE_ANON_KEY}"
    } > .env
    if [[ -n "${EXPO_PUBLIC_SITE_URL:-}" ]]; then
      printf '%s\n' "EXPO_PUBLIC_SITE_URL=${EXPO_PUBLIC_SITE_URL}" >> .env
    fi
    if [[ -n "${EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID:-}" ]]; then
      printf '%s\n' "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=${EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID}" >> .env
    fi
    if [[ -n "${EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID:-}" ]]; then
      printf '%s\n' "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=${EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID}" >> .env
    fi
  )
  echo "ci_post_clone: wrote mobile/.env"
else
  echo "ci_post_clone: WARNING: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY not set — add them in Xcode Cloud workflow environment (App Store Connect)."
fi

echo "ci_post_clone: npm ci in mobile/ (requires Node >= ${XCODE_CLOUD_NODE_MIN_VERSION})"
run_npm_ci() {
  local max_attempts="${XCODE_CLOUD_NPM_CI_ATTEMPTS:-3}"
  local wait_seconds="${XCODE_CLOUD_NPM_CI_RETRY_WAIT:-20}"
  local attempt=1

  while [[ "${attempt}" -le "${max_attempts}" ]]; do
    echo "ci_post_clone: npm ci attempt ${attempt}/${max_attempts}..."
    if [[ "${attempt}" -gt 1 ]]; then
      rm -rf node_modules
    fi
    if npm ci && [[ -d node_modules/expo && -d node_modules/react-native ]]; then
      return 0
    fi
    echo "ci_post_clone: npm ci failed or mobile deps incomplete (expo/react-native missing)" >&2
    if [[ "${attempt}" -lt "${max_attempts}" ]]; then
      echo "ci_post_clone: retrying npm ci in ${wait_seconds}s..."
      sleep "${wait_seconds}"
    fi
    attempt=$((attempt + 1))
  done
  return 1
}

if ! run_npm_ci; then
  echo "ci_post_clone: npm ci failed after retries (node $(node -v))" >&2
  exit 1
fi

if [[ ! -d node_modules/expo ]]; then
  echo "ci_post_clone: node_modules/expo missing after npm ci" >&2
  exit 1
fi

if [[ ! -d node_modules/@synth/shared ]]; then
  echo "ci_post_clone: @synth/shared missing after npm ci (file:../packages/synth-shared)" >&2
  exit 1
fi
echo "ci_post_clone: @synth/shared linked"

echo "ci_post_clone: patch Expo iOS Swift (RN API workarounds)"
bash "${REPO}/mobile/ios/ci_scripts/patch-expo-ios-swift.sh"

cd "${REPO}/mobile/ios"

# CocoaPods default CDN (cdn.cocoapods.org) often hits Net::OpenTimeout on Xcode Cloud.
# Retry with backoff instead of failing the whole workflow on a transient network blip.
run_pod_install() {
  local max_attempts="${XCODE_CLOUD_POD_INSTALL_ATTEMPTS:-6}"
  local wait_seconds="${XCODE_CLOUD_POD_INSTALL_RETRY_WAIT:-45}"
  local attempt=1

  while [ "${attempt}" -le "${max_attempts}" ]; do
    echo "ci_post_clone: pod install (attempt ${attempt}/${max_attempts})..."
    if pod install; then
      return 0
    fi
    if [ "${attempt}" -lt "${max_attempts}" ]; then
      echo "ci_post_clone: pod install failed; retrying in ${wait_seconds}s..."
      sleep "${wait_seconds}"
    fi
    attempt=$((attempt + 1))
  done

  echo "ci_post_clone: pod install failed after ${max_attempts} attempts" >&2
  return 1
}

echo "ci_post_clone: pod install"
# Prime CDN / DNS-TLS path (best-effort; failures are ignored).
echo "ci_post_clone: CocoaPods CDN check (best-effort)..."
curl -fsSL --max-time 120 --retry 4 --retry-delay 10 \
  "https://cdn.cocoapods.org/CocoaPods-version.yml" >/dev/null 2>&1 || true

if run_pod_install; then
  echo "ci_post_clone: pod install OK (CocoaPods CDN)."
else
  echo "ci_post_clone: pod install failed after CDN retries; falling back to git CocoaPods Specs (slow first clone, avoids cdn.cocoapods.org)." >&2
  export XCODE_CLOUD_POD_USE_GIT_SPECS=1
  if ! run_pod_install; then
    echo "ci_post_clone: pod install failed even with git specs repo." >&2
    echo "ci_post_clone: If the app still crashes on device after a successful build, open Xcode Organizer → Crashes → copy the symbolicated crashed thread for that build." >&2
    exit 1
  fi
  echo "ci_post_clone: pod install OK (git specs fallback)."
fi

echo "ci_post_clone: done. Ship this archive; match TestFlight build to git ${GIT_SHA}."
echo "ci_post_clone: Still crashing? Xcode → Window → Organizer → Crashes → latest Synth build → copy top of crashed thread."
