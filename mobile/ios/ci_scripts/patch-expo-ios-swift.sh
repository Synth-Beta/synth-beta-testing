#!/bin/bash
# Patch Expo iOS Swift RN API workarounds after npm ci (see mobile/scripts/patch-expo-ios-swift.mjs).
set -euo pipefail
REPO="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
NODE="$(command -v node 2>/dev/null || true)"
if [[ -z "${NODE}" ]]; then
  echo "patch-expo-ios-swift: node not found" >&2
  exit 1
fi
"${NODE}" "${REPO}/mobile/scripts/patch-expo-ios-swift.mjs"
