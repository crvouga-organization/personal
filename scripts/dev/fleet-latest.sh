#!/bin/sh
# Moves the homelab pins to the latest homelab: fleet.revision to the head of
# homelab's default branch, and @crvouga/homelab in
# packages/workstation/package.json to that same commit (a git dependency)
# until the package is on npm, then to the npm `latest` tag. Refreshes bun.lock.
# This repository always runs the latest homelab; the "homelab latest"
# workflow runs this hourly and auto-merges the result.
#
#   sh scripts/dev/fleet-latest.sh          update the pins (no-op when current)
#   sh scripts/dev/fleet-latest.sh --check  exit 1 when either pin is behind
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
mode=${1:-write}
case "$mode" in write|--check) ;; *) echo 'Usage: fleet-latest.sh [--check]' >&2; exit 2;; esac
manifest="$root/packages/workstation/package.json"
package='@crvouga/homelab'

repository=$(sed -n 's/.*"repository": *"\([^"]*\)".*/\1/p' "$root/fleet.json" | head -n 1)
[ -n "$repository" ] || { echo 'fleet.json names no source.repository.' >&2; exit 2; }
latest_revision=$(git ls-remote "$repository" HEAD | cut -f1)
case "$latest_revision" in *[!a-f0-9]*|'') echo "Could not resolve the head of $repository." >&2; exit 3;; esac
slug=$(printf '%s\n' "$repository" | sed -n 's|^https://github.com/\([^/]*/[^/.]*\)\(.git\)\{0,1\}$|\1|p')
[ -n "$slug" ] || { echo "Could not read a GitHub repository from $repository." >&2; exit 2; }
# curl exits non-zero until the package is published. The pipeline has no
# pipefail, so an empty body leaves latest_npm empty and the pin stays a commit.
latest_npm=$(curl -fsSL "https://registry.npmjs.org/-/package/$package/dist-tags" 2>/dev/null | sed -n 's/.*"latest":"\([^"]*\)".*/\1/p' || true)
if [ -n "$latest_npm" ]; then
  latest_spec=$latest_npm
else
  latest_spec="github:${slug}#${latest_revision}"
fi

current_revision=$(tr -d '[:space:]' <"$root/fleet.revision")
current_spec=$(sed -n "s|.*\"$package\": *\"\\([^\"]*\\)\".*|\\1|p" "$manifest" | head -n 1)
[ -n "$current_spec" ] || { echo "$manifest does not depend on $package." >&2; exit 2; }

echo "fleet.revision      $current_revision -> $latest_revision"
echo "$package  $current_spec -> $latest_spec"
if [ "$current_revision" = "$latest_revision" ] && [ "$current_spec" = "$latest_spec" ]; then
  echo 'homelab pins are current.'
  exit 0
fi
if [ "$mode" = --check ]; then
  echo 'homelab pins are behind the latest homelab. Run: bun run fleet:latest' >&2
  exit 1
fi

printf '%s\n' "$latest_revision" >"$root/fleet.revision"
sed -i.bak "s|\"$package\": *\"[^\"]*\"|\"$package\": \"$latest_spec\"|" "$manifest"
rm -f "$manifest.bak"
cd "$root"
bun install
echo 'homelab pins updated.'
