#!/bin/bash
# Patch expo-notifications BadgeModule.swift after npm ci (see mobile/scripts/patch-expo-notifications-badge.mjs).
set -euo pipefail
REPO="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
NODE="$(command -v node 2>/dev/null || true)"
if [[ -z "${NODE}" ]]; then
  echo "patch-expo-notifications-badge: node not found" >&2
  exit 1
fi
"${NODE}" "${REPO}/mobile/scripts/patch-expo-notifications-badge.mjs"
