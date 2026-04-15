#!/usr/bin/env sh
# Repo-local SSH for Git: uses keys in this directory only (no ~/.ssh/config).
KEYROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec ssh \
  -i "$KEYROOT/id_ed25519_digital_ripples" \
  -o IdentitiesOnly=yes \
  -o AddKeysToAgent=no \
  "$@"
