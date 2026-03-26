#!/bin/sh
# Xcode Cloud runs this after clone, before xcodebuild.
# Expo/RN need mobile/node_modules for the Podfile and the "Bundle React Native code" phase.
set -euo pipefail

REPO="${CI_PRIMARY_REPOSITORY_PATH:-$(cd "$(dirname "$0")/../../.." && pwd)}"
echo "ci_post_clone: REPO=${REPO}"

cd "${REPO}/mobile"
echo "ci_post_clone: npm ci in mobile/"
npm ci

cd "${REPO}/mobile/ios"
echo "ci_post_clone: pod install"
pod install
