#!/usr/bin/env sh
# Regenerate a COMPLETE, cross-platform package-lock.json.
#
# Why this exists: npm writes the installable lockfile entries for a package's
# platform-specific native binaries (the optionalDependencies of lightningcss,
# @tailwindcss/oxide, @next/swc, ...) based on the platform it resolves on. A lock
# regenerated incrementally, or from scratch on a single OS in a way that prunes
# the others, can end up missing (say) the linux-x64-gnu entries. `npm ci` then
# installs ONLY what's in the lock, so the Linux CI/Vercel builders fail with
#   Error: Cannot find module '../lightningcss.linux-x64-gnu.node'
#
# A clean, from-scratch resolve records every platform's entries. This does that
# resolve inside a Linux container (over just the workspace manifests, so it's
# fast and never touches your local node_modules) and writes the result back.
#
# Run it after changing dependencies, then commit package-lock.json. Requires
# Docker.
set -eu
cd "$(dirname "$0")/.."

# Stop Git Bash / MSYS from rewriting the container-side paths (/repo -> C:\...).
# Harmless no-ops on Linux/macOS shells.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

docker run --rm -v "$PWD:/repo" -w /repo node:24 sh -c '
  set -eu
  mkdir -p /work/app
  cp package.json /work/package.json
  cp app/package.json /work/app/package.json
  for d in packages/*/; do mkdir -p "/work/$d"; cp "${d}package.json" "/work/$d"; done
  cd /work
  # --ignore-scripts: we copy only the manifests, not the source, so a workspace
  # lifecycle script (packages/ui runs `tsc` on prepare) would fail against the
  # source-less copy and abort the resolve. We only need the lockfile, never a
  # build. stdout is muted; stderr stays visible so a real resolve error surfaces.
  npm install --ignore-scripts --no-audit --no-fund >/dev/null
  cp package-lock.json /repo/package-lock.json
'

echo "Regenerated package-lock.json with all-platform native-binary entries."
