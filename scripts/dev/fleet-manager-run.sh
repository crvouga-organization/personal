#!/bin/sh
# Executed on the manager over strict SSH when fleet-sync is started on a
# worker. Runs fleet-sync from a clean, fleet-owned checkout of the exact
# approved revision, so fixes in that revision reach the manager too (not
# whatever the human's checkout has). Checkouts are reused when warm and
# pruned to the three most recent. Never touches the human's working tree.
set -eu
revision=$1
shift
case "$revision" in *[!a-f0-9]*|'') exit 2;; esac
[ "${#revision}" = 40 ] || exit 2
say() { printf 'fleet-sync (manager): %s\n' "$1" >&2; }
launcher=$(command -v personal) || { say 'the personal launcher is not installed; run bun run personal:install on the manager.'; exit 3; }
repo=$(git -C "$(dirname "$(readlink -f "$launcher")")" rev-parse --show-toplevel) || { say 'cannot locate the manager checkout.'; exit 3; }
runs="$HOME/.local/share/personal/fleet/manager-runs"
dir="$runs/$revision"
ready() {
  [ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" = "$revision" ] &&
    [ -z "$(git -C "$dir" status --porcelain 2>/dev/null)" ]
}
if ! ready; then
  git -C "$repo" cat-file -e "$revision^{commit}" 2>/dev/null || git -C "$repo" fetch --quiet origin || true
  git -C "$repo" cat-file -e "$revision^{commit}" 2>/dev/null || { say "revision $revision is neither on the manager nor on origin; push it first."; exit 4; }
  mkdir -p "$runs"
  chmod 700 "$runs"
  # A fleet-owned, disposable run checkout: recreate it when stale or dirty.
  if [ -e "$dir" ]; then git -C "$repo" worktree remove --force "$dir" 2>/dev/null || rm -rf -- "$dir"; fi
  git -C "$repo" worktree prune
  git -C "$repo" worktree add --quiet --detach "$dir" "$revision"
fi
touch "$dir"
cd "$dir"
mise trust --quiet "$dir/mise.toml" >/dev/null 2>&1 || true
# The manager runs the same locked toolchain (and so the same agent versions)
# as every worker: publish this revision's global config and install it. Warm
# runs only re-check installed tools.
mise exec --locked bun -- bun scripts/dev/setup.ts --tools-only >&2 || { say 'shared toolchain install failed in the run checkout.'; exit 5; }
# Frozen install; near-instant when this checkout is already warm.
mise exec --locked bun -- bun install --frozen-lockfile --silent >&2 || { say 'frozen dependency install failed in the run checkout.'; exit 5; }
# Keep the three most recent run checkouts (names are commit SHAs).
# shellcheck disable=SC2012
for old in $(ls -1t "$runs" | tail -n +4); do
  git -C "$repo" worktree remove --force "$runs/$old" 2>/dev/null || true
done
git -C "$repo" worktree prune
export PERSONAL_WORKSPACE="$dir"
exec mise exec --locked bun -- bun packages/personal-cli/src/cli.ts fleet-sync --revision "$revision" "$@"
