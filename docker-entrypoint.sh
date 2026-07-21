#!/bin/sh
# Bring the database up to the version this image expects, then start.
#
# Migrations run on BOOT rather than as a separate deploy step, because the
# alternative is an image that starts happily against a schema it does not
# understand and fails later, somewhere less obvious. Both steps are idempotent
# and take an advisory lock, so several replicas starting at once serialize
# instead of racing.
#
# Set FLAGON_SKIP_MIGRATIONS=1 if you run them yourself in a job.
set -e

# Fail here, with an instruction, rather than booting an app whose sessions
# cannot be signed. The check lives in the image and not in compose.yml
# because Compose interpolates every service's variables even when a profile
# excludes that service, so a required-variable there would block development
# from starting Postgres over a secret only self-hosting needs. It also covers
# `docker run`, which never reads a compose file at all.
if [ -z "${BETTER_AUTH_SECRET}" ]; then
  echo "flagon: BETTER_AUTH_SECRET is not set. Sign in cannot work without it." >&2
  echo "flagon: generate one with:  openssl rand -base64 32" >&2
  exit 1
fi

if [ "${FLAGON_SKIP_MIGRATIONS}" = "1" ]; then
  echo "flagon: FLAGON_SKIP_MIGRATIONS=1, skipping provision and migrate."
else
  # Both scripts exit 0 when no owner URL is configured, so an image started
  # without a database still boots and reports unhealthy rather than crash
  # looping with a stack trace nobody reads.
  echo "flagon: provisioning the restricted app role..."
  node scripts/db-provision.mjs
  echo "flagon: applying migrations..."
  node scripts/db-migrate.mjs
fi

exec "$@"
