#!/usr/bin/env bash
# Push the generated Homebrew formula to the tap repository.
#
# Needs (env):
#   VERSION    the version being published (for example 1.0.0)
#   TAP_TOKEN  a fine-grained token with contents:write on wavyx/homebrew-tap.
#              Without it this script does nothing and never fails.
# Needs (file): packaging/homebrew/exactcli.rb, written by
#   `node scripts/gen-dist.mjs "$VERSION"`.
set -euo pipefail

: "${VERSION:?VERSION required}"

# A prerelease never moves the stable formula.
case "$VERSION" in
  *-*) echo "prerelease $VERSION - skipping the tap"; exit 0 ;;
esac

if [ -z "${TAP_TOKEN:-}" ]; then
  echo "No TAP_TOKEN - skipping the Homebrew tap."
  echo "Add the secret, or run 'node scripts/gen-dist.mjs $VERSION' and push the formula by hand."
  exit 0
fi

git config --global user.name "exactcli-release"
git config --global user.email "release@wavyx.dev"

tmp="$(mktemp -d)"
git clone --depth 1 "https://x-access-token:${TAP_TOKEN}@github.com/wavyx/homebrew-tap.git" "$tmp"
mkdir -p "$tmp/Formula"
cp packaging/homebrew/exactcli.rb "$tmp/Formula/exactcli.rb"
git -C "$tmp" add Formula/exactcli.rb
if git -C "$tmp" commit -m "exactcli $VERSION"; then
  git -C "$tmp" push
  echo "pushed wavyx/homebrew-tap Formula/exactcli.rb"
else
  echo "no change for the formula"
fi
