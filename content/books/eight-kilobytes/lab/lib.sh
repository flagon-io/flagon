# Shared plumbing for the multi-server labs (the NN-slug.sh scripts). Not a
# lab itself: each script names its compose file and sources this first.
#
#   LAB_COMPOSE=39-sharding.compose.yml
#   . "$(dirname "$0")/lib.sh"
#
# What it gives a script:
#   COMPOSE / compose   docker compose for that file (array, and a function)
#   prove <claim> <cmd> prints "PROVED: <claim>" when cmd succeeds, or
#                       "NOT PROVED: <claim>" and stops the script
#   section <title>     a heading with the seconds since the servers came up
#   start [up args]     tear down leftovers, then `up -d --wait`
#   cleanup             `down -v`: containers and volumes gone
#   tidy                runs on every exit; a script overrides it for its own
#                       temporary files or background jobs
# On exit the servers are torn down, unless KEEP is set: KEEP=1 leaves them
# running to explore.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
# Git Bash on Windows would rewrite /paths in arguments meant for containers.
export MSYS_NO_PATHCONV=1

: "${LAB_COMPOSE:?set LAB_COMPOSE to the compose file of the lab before sourcing lib.sh}"
COMPOSE=(docker compose -f "$LAB_COMPOSE")
compose() { "${COMPOSE[@]}" "$@"; }
started=$SECONDS

prove() { local claim="$1"; shift; if "$@"; then echo "PROVED: $claim"; else echo "NOT PROVED: $claim"; exit 1; fi; }
section() { echo; echo "== $* ($((SECONDS - started)) s)"; }

cleanup() { "${COMPOSE[@]}" down -v >/dev/null 2>&1 || true; }
tidy() { :; }
lab_exit() {
  tidy || true
  if [ -n "${KEEP:-}" ]; then
    echo "KEEP is set: the containers are still running (docker compose -f $LAB_COMPOSE down -v when done)"
  else
    cleanup
  fi
}
trap lab_exit EXIT

# start [up args]: remove anything a previous run left behind, start the
# servers, and wait until every healthcheck passes. Shows Docker's output only
# if that fails.
start() {
  local out
  cleanup
  if ! out=$("${COMPOSE[@]}" up -d --wait "$@" 2>&1); then
    echo "$out" | tail -20
    echo "the servers did not start"
    exit 1
  fi
  started=$SECONDS
}
