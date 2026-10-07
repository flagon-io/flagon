#!/bin/bash
# Runs once, the first time the container starts with an empty data directory.
# Builds the book's sample database and freezes it as a template, so every lab
# starts from an identical copy.
set -euo pipefail
psql -v ON_ERROR_STOP=1 -q -c "create database book"
psql -v ON_ERROR_STOP=1 -q -d book -f /lab/seed.sql
psql -v ON_ERROR_STOP=1 -q -d book -f /lab/helpers.sql
psql -v ON_ERROR_STOP=1 -q -c "alter database book is_template true" -c "alter database book allow_connections false"
# Flush now, so the seeding server's shutdown has no long checkpoint to do
# before the real server can start.
psql -v ON_ERROR_STOP=1 -q -c "checkpoint"
