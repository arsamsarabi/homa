#!/usr/bin/env bash
# Prints the changelog section for one version: the lines under "## [VERSION] - YYYY-MM-DD", up to
# the next "## [" heading. Fails when that section is missing, has no date, or is empty, so a tag
# can't be released without its notes.
# Usage: .github/scripts/release-notes.sh 0.1.0 [docs/CHANGELOG.md]
set -euo pipefail

version=${1:?usage: release-notes.sh VERSION [CHANGELOG]}
file=${2:-docs/CHANGELOG.md}

heading=$(awk -v h="## [$version]" '$0 == h || index($0, h " ") == 1 { print; exit }' "$file")
if [ -z "$heading" ]; then
  echo "error: $file has no '## [$version] - YYYY-MM-DD' section" >&2
  exit 1
fi
if ! [[ $heading =~ \ -\ [0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "error: set the release date in $file: '$heading' should end in ' - YYYY-MM-DD'" >&2
  exit 1
fi

# Body without the blank lines around it.
body=$(awk -v h="$heading" '$0 == h { f = 1; next } f && /^## \[/ { exit } f { print }' "$file" | sed '/./,$!d')
if [ -z "${body//[[:space:]]/}" ]; then
  echo "error: the '$heading' section in $file is empty" >&2
  exit 1
fi
printf '%s\n' "$body"
