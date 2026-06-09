#!/bin/bash
# Runs after xcodebuild archive (pass or fail). Surfaces the real error in this step's log.
set -uo pipefail

ARCHIVE_PATH="${CI_ARCHIVE_PATH:-/Volumes/workspace/build.xcarchive}"
DERIVED_DATA="${CI_DERIVED_DATA_PATH:-/Volumes/workspace/DerivedData}"
RESULT_BUNDLE="${CI_RESULT_BUNDLE_PATH:-/Volumes/workspace/resultbundle.xcresult}"

echo "ci_post_xcodebuild: CI_XCODEBUILD_ACTION=${CI_XCODEBUILD_ACTION:-unknown}"
echo "ci_post_xcodebuild: CI_XCODEBUILD_EXIT_CODE=${CI_XCODEBUILD_EXIT_CODE:-unknown}"
echo "ci_post_xcodebuild: CI_ARCHIVE_PATH=${ARCHIVE_PATH}"

if [[ -d "${ARCHIVE_PATH}" ]]; then
  echo "ci_post_xcodebuild: Archive exists — xcodebuild archive succeeded."
  exit 0
fi

echo "ci_post_xcodebuild: ========== ARCHIVE FAILED — ERROR SUMMARY =========="
echo "ci_post_xcodebuild: Archive not found at ${ARCHIVE_PATH}"
echo ""

read_activity_log() {
  local file="$1"
  if [[ ! -f "${file}" ]]; then
    return 0
  fi
  # xcactivitylog is usually gzip-compressed; plain strings() misses errors.
  if gzip -t "${file}" 2>/dev/null; then
    gzip -dc "${file}" 2>/dev/null || gunzip -c "${file}" 2>/dev/null || zcat "${file}" 2>/dev/null
  else
    cat "${file}" 2>/dev/null
  fi
}

dump_activity_log_errors() {
  local file="$1"
  echo "ci_post_xcodebuild: --- build activity log: ${file} ---"
  read_activity_log "${file}" \
    | grep -E "error:|fatal error:|BUILD FAILED|Command .* failed|Signing|entitlements|provisioning profile|No profiles|CodeSign|exportArchive" \
    | tail -60 || true
  echo ""
}

# 1) xcresulttool human summary (Xcode 15+)
if [[ -d "${RESULT_BUNDLE}" ]]; then
  echo "ci_post_xcodebuild: --- xcresult summarize ---"
  if xcrun xcresulttool summarize --path "${RESULT_BUNDLE}" 2>/dev/null; then
    echo ""
  else
    echo "ci_post_xcodebuild: (summarize not available, trying legacy JSON)"
    echo ""
  fi

  echo "ci_post_xcodebuild: --- xcresult error messages ---"
  if command -v python3 >/dev/null 2>&1; then
    xcrun xcresulttool get object --legacy --path "${RESULT_BUNDLE}" --format json 2>/dev/null \
      | python3 -c "
import json, sys

def collect_messages(obj, out):
    if isinstance(obj, dict):
        msg = obj.get('message')
        if isinstance(msg, dict) and '_value' in msg:
            text = str(msg['_value']).strip()
            if text:
                issue = obj.get('issueType', {})
                itype = issue.get('_value', '') if isinstance(issue, dict) else ''
                out.append(f'{itype}: {text}' if itype else text)
        for v in obj.values():
            collect_messages(v, out)
    elif isinstance(obj, list):
        for item in obj:
            collect_messages(item, out)

raw = sys.stdin.read().strip()
if raw:
    try:
        data = json.loads(raw)
        messages = []
        collect_messages(data, messages)
        seen = set()
        for m in messages:
            if m not in seen:
                seen.add(m)
                print(m)
    except json.JSONDecodeError:
        pass
" || true
    echo ""
  fi
fi

# 2) DerivedData activity logs (decompressed)
if [[ -d "${DERIVED_DATA}/Logs/Build" ]]; then
  while IFS= read -r logfile; do
    dump_activity_log_errors "${logfile}"
  done < <(find "${DERIVED_DATA}/Logs/Build" -name "*.xcactivitylog" -type f 2>/dev/null | sort -r | head -3)
fi

# 3) Plain .log files
if [[ -d "${DERIVED_DATA}/Logs" ]]; then
  while IFS= read -r logfile; do
    echo "ci_post_xcodebuild: --- log file: ${logfile} ---"
    grep -E "error:|fatal error:|BUILD FAILED|Signing|entitlements|provisioning profile" "${logfile}" 2>/dev/null | tail -40 || true
    echo ""
  done < <(find "${DERIVED_DATA}/Logs" -name "*.log" -type f 2>/dev/null | sort -r | head -5)
fi

echo "ci_post_xcodebuild: ========== END ERROR SUMMARY =========="
echo "ci_post_xcodebuild: Copy everything between the === lines and send it for debugging."
exit 0
