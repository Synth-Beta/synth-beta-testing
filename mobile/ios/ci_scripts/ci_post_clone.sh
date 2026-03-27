#!/bin/bash
# Xcode Cloud runs this after clone, before xcodebuild.
# Expo/RN need mobile/node_modules for the Podfile and the "Bundle React Native code" phase.
#
# Xcode Cloud images often do not expose `npm` on PATH; Node may still exist under Homebrew
# or must be installed (brew or official tarball).
set -euo pipefail

REPO="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
echo "ci_post_clone: REPO=${REPO}"

ensure_npm() {
  # Apple Silicon + Intel Homebrew locations (not always on default PATH).
  export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH}"

  if command -v npm >/dev/null 2>&1; then
    echo "ci_post_clone: found npm at $(command -v npm)"
    return 0
  fi

  if command -v brew >/dev/null 2>&1; then
    echo "ci_post_clone: npm missing; installing Node via Homebrew..."
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

cd "${REPO}/mobile"
echo "ci_post_clone: npm ci in mobile/"
npm ci

cd "${REPO}/mobile/ios"
echo "ci_post_clone: pod install"
pod install
