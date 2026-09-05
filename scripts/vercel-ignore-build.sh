#!/usr/bin/env bash
# Conservative Vercel Ignored Build Step for Gridiron Edge.
#
# Configure in Vercel:
# Project Settings -> Git -> Ignored Build Step
#   bash scripts/vercel-ignore-build.sh
#
# Contract:
#   exit 0 = SKIP the Vercel build
#   exit 1 = PROCEED with the Vercel build
#
# Safety principle: any uncertainty must BUILD.

set -u

echo "[vercel-ignore] evaluating changed paths"

HEAD_SHA="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
BASE_SHA="${VERCEL_GIT_PREVIOUS_SHA:-}"

# VERCEL_GIT_PREVIOUS_SHA is the preferred comparison point when the
# Ignored Build Step is configured. If it is unavailable or unusable,
# do not guess: perform the build.
if [[ -z "${BASE_SHA}" ]]; then
  echo "[vercel-ignore] BUILD: VERCEL_GIT_PREVIOUS_SHA is unavailable"
  exit 1
fi

if ! git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  echo "[vercel-ignore] BUILD: previous deployment SHA is not available in Git history"
  exit 1
fi

if ! git cat-file -e "${HEAD_SHA}^{commit}" 2>/dev/null; then
  echo "[vercel-ignore] BUILD: deploying SHA is not available in Git history"
  exit 1
fi

CHANGED_FILES="$(git diff --name-only "${BASE_SHA}" "${HEAD_SHA}" -- 2>/dev/null)"
DIFF_STATUS=$?

if [[ ${DIFF_STATUS} -ne 0 ]]; then
  echo "[vercel-ignore] BUILD: git diff failed"
  exit 1
fi

if [[ -z "${CHANGED_FILES}" ]]; then
  echo "[vercel-ignore] BUILD: no trustworthy changed-file set was produced"
  exit 1
fi

echo "[vercel-ignore] changed files:"
printf '%s\n' "${CHANGED_FILES}" | sed 's/^/  - /'

while IFS= read -r file; do
  [[ -z "${file}" ]] && continue

  case "${file}" in
    docs/*)
      ;;
    README.md)
      ;;
    SEASON_STATUS.md)
      ;;
    WORKFLOW_DISABLE_REPORT.md)
      ;;
    .cursor/rules/*)
      ;;
    *)
      echo "[vercel-ignore] BUILD: unapproved or runtime-relevant path: ${file}"
      exit 1
      ;;
  esac
done <<< "${CHANGED_FILES}"

echo "[vercel-ignore] SKIP: every changed file is in the approved non-runtime allowlist"
exit 0
