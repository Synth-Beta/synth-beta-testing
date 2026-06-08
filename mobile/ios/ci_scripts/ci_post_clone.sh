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

ensure_npm() {
  # Apple Silicon + Intel Homebrew locations (not always on default PATH).
  export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"

  if command -v npm >/dev/null 2>&1; then
    echo "ci_post_clone: found npm at $(command -v npm)"
    return 0
  fi

  if command -v brew >/dev/null 2>&1; then
    echo "ci_post_clone: npm missing; installing Node via Homebrew..."
    # Avoid long Homebrew auto-update + extra network on CI (often slow/flaky).
    export HOMEBREW_NO_AUTO_UPDATE=1
    export HOMEBREW_NO_ENV_HINTS=1
    brew install node
    hash -r || true
    return 0
  fi

  # Last resort: official Node binary (no Homebrew).
  local ver arch dir
  ver="${XCODE_CLOUD_NODE_VERSION:-20.18.1}"
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
  if [[ ! -x "${dir}/bin/npm" ]]; then
    echo "ci_post_clone: installing Node ${ver} (${arch}) from nodejs.org..."
    mkdir -p "${HOME}/.xcode-cloud-node"
    curl -fsSL "https://nodejs.org/dist/v${ver}/node-v${ver}-darwin-${arch}.tar.gz" -o /tmp/xcode-cloud-node.tgz
    rm -rf "${dir}"
    tar -xzf /tmp/xcode-cloud-node.tgz -C "${HOME}/.xcode-cloud-node"
    rm -f /tmp/xcode-cloud-node.tgz
  fi

  export PATH="${dir}/bin:${PATH}"
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
umask 077
printf 'export NODE_BINARY=%q\n' "${NODE_PATH}" > "${REPO}/mobile/ios/.xcode.env.local"
echo "ci_post_clone: wrote mobile/ios/.xcode.env.local (NODE_BINARY=${NODE_PATH})"

cd "${REPO}/mobile"

# Expo inlines EXPO_PUBLIC_* at bundle time; Xcode Cloud does not load a local .env.
# Configure these as encrypted workflow environment variables in App Store Connect
# (same names), or they will be inherited if exported by the runner.
if [[ -n "${EXPO_PUBLIC_SUPABASE_URL:-}" && -n "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  echo "ci_post_clone: writing mobile/.env from Xcode Cloud env (Supabase)"
  umask 077
  {
    printf '%s\n' "EXPO_PUBLIC_SUPABASE_URL=${EXPO_PUBLIC_SUPABASE_URL}"
    printf '%s\n' "EXPO_PUBLIC_SUPABASE_ANON_KEY=${EXPO_PUBLIC_SUPABASE_ANON_KEY}"
  } > .env
  # Optional mobile vars (Google sign-in on Android, site URL, etc.)
  [[ -n "${EXPO_PUBLIC_SITE_URL:-}" ]] && printf '%s\n' "EXPO_PUBLIC_SITE_URL=${EXPO_PUBLIC_SITE_URL}" >> .env
  [[ -n "${EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID:-}" ]] && printf '%s\n' "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=${EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID}" >> .env
  [[ -n "${EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID:-}" ]] && printf '%s\n' "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=${EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID}" >> .env
else
  echo "ci_post_clone: WARNING: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY not set — add them in Xcode Cloud workflow environment (App Store Connect)."
fi

echo "ci_post_clone: npm ci in mobile/"
npm ci

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
