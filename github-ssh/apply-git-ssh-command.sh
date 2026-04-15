#!/usr/bin/env sh
# Run once from any directory inside this repo to wire Git to github-ssh/git-ssh.sh
set -e
ROOT="$(git rev-parse --show-toplevel)"
# Quote path for core.sshCommand so volumes/paths with spaces work
git -C "$ROOT" config core.sshCommand "\"$ROOT/github-ssh/git-ssh.sh\""
echo "This repo now uses: $ROOT/github-ssh/git-ssh.sh"
echo "Remote SSH test: ssh -T git@github.com"
echo "  (with: GIT_SSH_COMMAND=\"$ROOT/github-ssh/git-ssh.sh\" ssh -T git@github.com)"
