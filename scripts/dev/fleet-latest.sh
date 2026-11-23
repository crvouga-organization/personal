#!/bin/sh
# Moves both dev-fleet pins to the latest dev-fleet: fleet.revision to the head
# of dev-fleet's default branch and @crvouga/dev-fleet in
# packages/workstation/package.json to the npm `latest` tag, then refreshes
# bun.lock. This repository always runs the latest dev-fleet; the
# "dev-fleet latest" workflow runs this hourly and auto-merges the result.
#
#   sh scripts/dev/fleet-latest.sh          update the pins (no-op when current)
#   sh scripts/dev/fleet-latest.sh --check  exit 1 when either pin is behind
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
mode=${1:-write}
case "$mode" in write|--check) ;; *) echo 'Usage: fleet-latest.sh [--check]' >&2; exit 2;; esac
manifest="$root/packages/workstation/package.json"
package='@crvouga/dev-fleet'

repository=$(sed -n 's/.*"repository": *"\([^"]*\)".*/\1/p' "$root/fleet.json" | head -n 1)
[ -n "$repository" ] || { echo 'fleet.json names no source.repository.' >&2; exit 2; }
latest_revision=$(git ls-remote "$repository" HEAD | cut -f1)
case "$latest_revision" in *[!a-f0-9]*|'') echo "Could not resolve the head of $repository." >&2; exit 3;; esac
latest_version=$(curl -fsSL "https://registry.npmjs.org/-/package/$package/dist-tags" | sed -n 's/.*"latest":"\([^"]*\)".*/\1/p')
[ -n "$latest_version" ] || { echo "Could not resolve the latest $package version." >&2; exit 3; }

current_revision=$(tr -d '[:space:]' <"$root/fleet.revision")
current_version=$(sed -n "s|.*\"$package\": *\"\\([^\"]*\\)\".*|\\1|p" "$manifest" | head -n 1)
[ -n "$current_version" ] || { echo "$manifest does not depend on $package." >&2; exit 2; }

echo "fleet.revision      $current_revision -> $latest_revision"
echo "$package  $current_version -> $latest_version"
if [ "$current_revision" = "$latest_revision" ] && [ "$current_version" = "$latest_version" ]; then
  echo 'dev-fleet pins are current.'
  exit 0
fi
if [ "$mode" = --check ]; then
  echo 'dev-fleet pins are behind the latest dev-fleet. Run: bun run fleet:latest' >&2
  exit 1
fi

printf '%s\n' "$latest_revision" >"$root/fleet.revision"
sed -i.bak "s|\"$package\": *\"[^\"]*\"|\"$package\": \"$latest_version\"|" "$manifest"
rm -f "$manifest.bak"
cd "$root"
bun install
echo 'dev-fleet pins updated.'
