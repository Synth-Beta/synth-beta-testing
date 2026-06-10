#!/bin/bash
# Runs after xcodebuild archive/export. Surfaces archive or export errors in this step's log.
set -uo pipefail

ARCHIVE_PATH="${CI_ARCHIVE_PATH:-/Volumes/workspace/build.xcarchive}"
DERIVED_DATA="${CI_DERIVED_DATA_PATH:-/Volumes/workspace/DerivedData}"
RESULT_BUNDLE="${CI_RESULT_BUNDLE_PATH:-/Volumes/workspace/resultbundle.xcresult}"

echo "ci_post_xcodebuild: CI_XCODEBUILD_ACTION=${CI_XCODEBUILD_ACTION:-unknown}"
echo "ci_post_xcodebuild: CI_XCODEBUILD_EXIT_CODE=${CI_XCODEBUILD_EXIT_CODE:-unknown}"
echo "ci_post_xcodebuild: CI_ARCHIVE_PATH=${ARCHIVE_PATH}"

read_activity_log() {
  local file="$1"
  if [[ ! -f "${file}" ]]; then
    return 0
  fi
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
    | grep -E "error:|fatal error:|BUILD FAILED|Command .* failed|Signing|entitlements|provisioning profile|No profiles|CodeSign|exportArchive|IDEDistribution|doesn't include|doesn't support" \
    | tail -80 || true
  echo ""
}

dump_export_logs() {
  local found=0
  local logdir logfile

  for logdir in \
    /Volumes/workspace/tmp/app-store-export-archive-logs \
    /Volumes/workspace/tmp/ad-hoc-export-archive-logs \
    /Volumes/workspace/tmp/development-export-archive-logs \
    /Volumes/workspace/tmp/*-export-archive-logs \
    /Volumes/Task/logs/app-store-export-archive-logs \
    /Volumes/Task/logs/ad-hoc-export-archive-logs \
    /Volumes/Task/logs/development-export-archive-logs \
    /Volumes/Task/logs/*-export-archive-logs; do
    [[ -d "${logdir}" ]] || continue
    found=1
    echo "ci_post_xcodebuild: --- export log directory: ${logdir} ---"
    while IFS= read -r logfile; do
      echo "ci_post_xcodebuild: --- ${logfile} ---"
      grep -E "error:|Error Domain|exportArchive|entitlements|provisioning profile|doesn't include|doesn't support|Signing|IDEDistribution" "${logfile}" 2>/dev/null | tail -60 || true
      echo ""
    done < <(find "${logdir}" -type f \( -name "*.log" -o -name "*.txt" \) 2>/dev/null | sort)
  done

  if [[ "${found}" -eq 0 ]]; then
    echo "ci_post_xcodebuild: (no export log directories found under /Volumes/workspace/tmp or /Volumes/Task/logs)"
    echo ""
  fi
}

print_archived_entitlements() {
  local app_path=""
  if [[ -d "${ARCHIVE_PATH}/Products/Applications" ]]; then
    app_path="$(find "${ARCHIVE_PATH}/Products/Applications" -maxdepth 1 -name "*.app" -type d 2>/dev/null | head -1)"
  fi
  if [[ -z "${app_path}" || ! -d "${app_path}" ]]; then
    return 0
  fi

  echo "ci_post_xcodebuild: --- embedded archive entitlements (${app_path}) ---"
  codesign -d --entitlements :- "${app_path}" 2>/dev/null || true
  echo ""
}

print_release_entitlements_file() {
  local entitlements="${CI_PRIMARY_REPOSITORY_PATH:-}/mobile/ios/Synth/Synth.release.entitlements"
  if [[ ! -f "${entitlements}" ]]; then
    entitlements="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/Synth/Synth.release.entitlements"
  fi
  if [[ -f "${entitlements}" ]]; then
    echo "ci_post_xcodebuild: --- Synth.release.entitlements ---"
    cat "${entitlements}"
    echo ""
  fi
}

if [[ -d "${ARCHIVE_PATH}" ]]; then
  echo "ci_post_xcodebuild: Archive exists — xcodebuild archive succeeded."
  print_archived_entitlements
  print_release_entitlements_file

  echo "ci_post_xcodebuild: --- checking exportArchive logs (exit 70 = signing/entitlements mismatch) ---"
  dump_export_logs

  echo "ci_post_xcodebuild: If export failed, enable these App ID capabilities for com.tejpatel.synth"
  echo "ci_post_xcodebuild: at https://developer.apple.com/account/resources/identifiers"
  echo "ci_post_xcodebuild:   - Push Notifications"
  echo "ci_post_xcodebuild:   - Sign in with Apple"
  echo "ci_post_xcodebuild:   - Associated Domains"
  echo "ci_post_xcodebuild: Then start a new Xcode Cloud build so managed profiles regenerate."
  exit 0
fi

echo "ci_post_xcodebuild: ========== ARCHIVE FAILED — ERROR SUMMARY =========="
echo "ci_post_xcodebuild: Archive not found at ${ARCHIVE_PATH}"
echo ""

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

if [[ -d "${DERIVED_DATA}/Logs/Build" ]]; then
  while IFS= read -r logfile; do
    dump_activity_log_errors "${logfile}"
  done < <(find "${DERIVED_DATA}/Logs/Build" -name "*.xcactivitylog" -type f 2>/dev/null | sort -r | head -3)
fi

if [[ -d "${DERIVED_DATA}/Logs" ]]; then
  while IFS= read -r logfile; do
    echo "ci_post_xcodebuild: --- log file: ${logfile} ---"
    grep -E "error:|fatal error:|BUILD FAILED|Signing|entitlements|provisioning profile|exportArchive" "${logfile}" 2>/dev/null | tail -40 || true
    echo ""
  done < <(find "${DERIVED_DATA}/Logs" -name "*.log" -type f 2>/dev/null | sort -r | head -5)
fi

dump_export_logs

echo "ci_post_xcodebuild: ========== END ERROR SUMMARY =========="
echo "ci_post_xcodebuild: Copy everything between the === lines and send it for debugging."
exit 0
