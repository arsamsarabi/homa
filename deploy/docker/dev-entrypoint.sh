#!/bin/sh
# Install workspace deps into the named volume, then run the compose command.
set -eu
cd /app
bun install
exec "$@"
