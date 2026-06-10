#!/bin/bash
# Runs after xcodebuild archive/export. Surfaces archive or export errors in this step's log.
set -uo pipefail

ARCHIVE_PATH="${CI_ARCHIVE_PATH:-/Volumes/workspace/build.xcarchive}"
DERIVED_DATA="${CI_DERIVED_DATA_PATH:-/Volumes/workspace/DerivedData}"
RESULT_BUNDLE="${CI_RESULT_BUNDLE_PATH:-/Volumes/workspace/resultbundle.xcresult}"

echo "ci_post_xcodebuild: CI_XCODEBUILD_ACTION=${CI_XCODEBUILD_ACTION:-unknown}"
echo "ci_post_xcodebuild: CI_XCODEBUILD_EXIT_CODE=${CI_XCODEBUILD_EXIT_CODE:-unknown}"
echo "ci_post_xcodebuild: CI_ARCHIVE_PATH=${ARCHIVE_PATH}"
echo "ci_post_xcodebuild: CI_APP_STORE_SIGNED_APP_PATH=${CI_APP_STORE_SIGNED_APP_PATH:-unset}"
echo "ci_post_xcodebuild: CI_AD_HOC_SIGNED_APP_PATH=${CI_AD_HOC_SIGNED_APP_PATH:-unset}"
echo "ci_post_xcodebuild: CI_DEVELOPMENT_SIGNED_APP_PATH=${CI_DEVELOPMENT_SIGNED_APP_PATH:-unset}"

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
    | grep -E "error:|fatal error:|BUILD FAILED|Command .* failed|Signing|entitlements|provisioning profile|No profiles|CodeSign|exportArchive|IDEDistribution|doesn't include|doesn't support|No signing certificate" \
    | tail -80 || true
  echo ""
}

dump_export_log_file() {
  local logfile="$1"
  echo "ci_post_xcodebuild: --- ${logfile} ---"
  if [[ ! -f "${logfile}" ]]; then
    echo "(missing)"
    echo ""
    return 0
  fi

  # Primary export log from Xcode Cloud (tee'd from xcodebuild -exportArchive).
  if [[ "$(basename "${logfile}")" == "xcodebuild-export-archive.log" ]]; then
    tail -120 "${logfile}" 2>/dev/null || true
    echo ""
    return 0
  fi

  if grep -Eiq "error:|exportArchive|Error Domain|doesn't include|doesn't support|No signing certificate|EXPORT FAILED" "${logfile}" 2>/dev/null; then
    grep -Ei "error:|exportArchive|Error Domain|doesn't include|doesn't support|No signing certificate|EXPORT FAILED" "${logfile}" 2>/dev/null | tail -80 || true
  else
    tail -40 "${logfile}" 2>/dev/null || true
  fi
  echo ""
}

print_export_archive_errors() {
  local logfile had_errors=0
  echo "ci_post_xcodebuild: --- exportArchive error lines (root cause for exit 70) ---"
  for logfile in \
    /Volumes/workspace/tmp/app-store-export-archive-logs/xcodebuild-export-archive.log \
    /Volumes/workspace/tmp/ad-hoc-export-archive-logs/xcodebuild-export-archive.log \
    /Volumes/workspace/tmp/development-export-archive-logs/xcodebuild-export-archive.log \
    /Volumes/Task/logs/app-store-export-archive-logs/xcodebuild-export-archive.log \
    /Volumes/Task/logs/ad-hoc-export-archive-logs/xcodebuild-export-archive.log \
    /Volumes/Task/logs/development-export-archive-logs/xcodebuild-export-archive.log; do
    [[ -f "${logfile}" ]] || continue
    echo "ci_post_xcodebuild: from ${logfile}:"
    if grep -Eiq "error: exportArchive|Error Domain|No signing certificate|doesn't include|doesn't support|EXPORT FAILED" "${logfile}" 2>/dev/null; then
      grep -Ei "error: exportArchive|Error Domain|No signing certificate|doesn't include|doesn't support|EXPORT FAILED" "${logfile}" 2>/dev/null | tail -80 || true
      had_errors=1
    else
      tail -15 "${logfile}" 2>/dev/null || true
    fi
    echo ""
  done
  if [[ "${had_errors}" -eq 0 ]]; then
    echo "ci_post_xcodebuild: (no exportArchive error lines in standard log paths — see full export logs below)"
    echo ""
  fi
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
    ls -la "${logdir}" 2>/dev/null || true
    echo ""

    if [[ -f "${logdir}/xcodebuild-export-archive.log" ]]; then
      dump_export_log_file "${logdir}/xcodebuild-export-archive.log"
    fi

    while IFS= read -r logfile; do
      [[ "${logfile}" == *"/xcodebuild-export-archive.log" ]] && continue
      dump_export_log_file "${logfile}"
    done < <(find "${logdir}" -type f 2>/dev/null | sort)
  done

  if [[ "${found}" -eq 0 ]]; then
    echo "ci_post_xcodebuild: searching /Volumes/workspace/tmp for export logs..."
    while IFS= read -r logfile; do
      found=1
      dump_export_log_file "${logfile}"
    done < <(find /Volumes/workspace/tmp -maxdepth 3 -type f \( -name 'xcodebuild-export-archive.log' -o -name '*export*.log' \) 2>/dev/null)
    if [[ "${found}" -eq 0 ]]; then
      echo "ci_post_xcodebuild: (no export log directories or files found)"
      echo ""
    fi
  fi
}

print_archived_entitlements() {
  local app_path=""
  if [[ -d "${ARCHIVE_PATH}/Products/Applications" ]]; then
    app_path="$(find "${ARCHIVE_PATH}/Products/Applications" -maxdepth 1 -name "*.app" -type d 2>/dev/null | head -1)"
  fi
  if [[ -z "${app_path}" || ! -d "${app_path}" ]]; then
    echo "ci_post_xcodebuild: (archive app bundle not found under ${ARCHIVE_PATH})"
    echo ""
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
    echo "ci_post_xcodebuild: --- Synth.release.entitlements (Release archive) ---"
    cat "${entitlements}"
    echo ""
  fi
}

export_failed=0
if [[ -d "${ARCHIVE_PATH}" ]]; then
  if [[ -z "${CI_APP_STORE_SIGNED_APP_PATH:-}" && -z "${CI_AD_HOC_SIGNED_APP_PATH:-}" && -z "${CI_DEVELOPMENT_SIGNED_APP_PATH:-}" ]]; then
    export_failed=1
  fi
fi

if [[ -d "${ARCHIVE_PATH}" ]]; then
  echo "ci_post_xcodebuild: Archive exists — xcodebuild archive succeeded."
  print_archived_entitlements
  print_release_entitlements_file

  if [[ "${export_failed}" -eq 1 ]]; then
    echo "ci_post_xcodebuild: ========== EXPORT FAILED (archive OK, exit 70) =========="
    print_export_archive_errors
    echo "ci_post_xcodebuild: --- full export logs ---"
    dump_export_logs
    echo "ci_post_xcodebuild: Required App ID capabilities for com.tejpatel.synth:"
    echo "ci_post_xcodebuild:   https://developer.apple.com/account/resources/identifiers"
    echo "ci_post_xcodebuild:   → Push Notifications"
    echo "ci_post_xcodebuild:   → Sign in with Apple"
    echo "ci_post_xcodebuild:   → Associated Domains (for applinks:join.getsynth.app)"
    echo "ci_post_xcodebuild:   Save → Confirm → NEW Xcode Cloud build (not Retry)"
    echo "ci_post_xcodebuild: If still failing: revoke expired 'Managed (Xcode Cloud)' certs at"
    echo "ci_post_xcodebuild:   https://developer.apple.com/account/resources/certificates/list"
    echo "ci_post_xcodebuild: Fastest ship path: cd mobile && eas build -p ios --profile production"
    echo "ci_post_xcodebuild: ================================================"
    exit 1
  fi

  echo "ci_post_xcodebuild: Export succeeded."
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
    grep -E "error:|fatal error:|BUILD FAILED|Signing|entitlements|provisioning profile|exportArchive|No signing certificate" "${logfile}" 2>/dev/null | tail -40 || true
    echo ""
  done < <(find "${DERIVED_DATA}/Logs" -name "*.log" -type f 2>/dev/null | sort -r | head -5)
fi

dump_export_logs

echo "ci_post_xcodebuild: ========== END ERROR SUMMARY =========="
exit 0
