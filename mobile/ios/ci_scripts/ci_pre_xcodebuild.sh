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

if [[ ! -d "${IOS_DIR}/Pods" ]]; then
  echo "ci_pre_xcodebuild: Pods/ missing — running pod install"
  (cd "${IOS_DIR}" && pod install)
fi

if [[ ! -d "${REPO}/packages/synth-shared/src" ]]; then
  echo "ci_pre_xcodebuild: packages/synth-shared missing (monorepo file: dep)" >&2
  exit 1
fi

echo "ci_pre_xcodebuild: ready for xcodebuild archive"
