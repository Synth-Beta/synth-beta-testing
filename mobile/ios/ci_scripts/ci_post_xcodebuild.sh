#!/bin/bash
# Runs after xcodebuild archive (pass or fail). Surfaces the real error in this step's log
# so you do not have to dig through the archive step manually.
set -uo pipefail

ARCHIVE_PATH="${CI_ARCHIVE_PATH:-/Volumes/workspace/build.xcarchive}"
DERIVED_DATA="${CI_DERIVED_DATA_PATH:-/Volumes/workspace/DerivedData}"
RESULT_BUNDLE="${CI_RESULT_BUNDLE_PATH:-/Volumes/workspace/resultbundle.xcresult}"

echo "ci_post_xcodebuild: CI_XCODEBUILD_ACTION=${CI_XCODEBUILD_ACTION:-unknown}"
echo "ci_post_xcodebuild: CI_ARCHIVE_PATH=${ARCHIVE_PATH}"

if [[ -d "${ARCHIVE_PATH}" ]]; then
  echo "ci_post_xcodebuild: Archive exists — xcodebuild archive succeeded."
  exit 0
fi

echo "ci_post_xcodebuild: ========== ARCHIVE FAILED — ERROR SUMMARY =========="
echo "ci_post_xcodebuild: Archive not found at ${ARCHIVE_PATH}"
echo "ci_post_xcodebuild: Searching build logs for error: lines..."
echo ""

dump_log_errors() {
  local label="$1"
  local file="$2"
  if [[ ! -f "${file}" ]]; then
    return 0
  fi
  echo "ci_post_xcodebuild: --- ${label} (${file}) ---"
  if [[ "${file}" == *.xcactivitylog ]]; then
    strings "${file}" 2>/dev/null | grep -E "error:|fatal error:|Command .* failed|BUILD FAILED|Signing|entitlements|provisioning profile" | tail -40 || true
  else
    grep -E "error:|fatal error:|Command .* failed|BUILD FAILED|Signing|entitlements|provisioning profile" "${file}" 2>/dev/null | tail -40 || true
  fi
  echo ""
}

# Latest Xcode build activity log (most useful for archive failures).
if [[ -d "${DERIVED_DATA}/Logs/Build" ]]; then
  while IFS= read -r logfile; do
    dump_log_errors "DerivedData build log" "${logfile}"
    break
  done < <(find "${DERIVED_DATA}/Logs/Build" -name "*.xcactivitylog" -type f 2>/dev/null | sort -r | head -3)
fi

# Plain-text logs sometimes land here.
if [[ -d "${DERIVED_DATA}/Logs" ]]; then
  while IFS= read -r logfile; do
    dump_log_errors "DerivedData log" "${logfile}"
  done < <(find "${DERIVED_DATA}/Logs" -name "*.log" -type f 2>/dev/null | sort -r | head -5)
fi

if [[ -d "${RESULT_BUNDLE}" ]]; then
  echo "ci_post_xcodebuild: --- result bundle (${RESULT_BUNDLE}) ---"
  xcrun xcresulttool get --path "${RESULT_BUNDLE}" --format json 2>/dev/null \
    | grep -E "message|issueType|severity|error" | head -60 || true
  echo ""
fi

echo "ci_post_xcodebuild: ========== END ERROR SUMMARY =========="
echo "ci_post_xcodebuild: Copy everything above this line and send it for debugging."
# Do not fail the workflow again — archive already failed.
exit 0
