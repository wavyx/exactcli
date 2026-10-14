---
title: Installation
description: Install exactcli with npm or Homebrew, and the optional jq binary.
---

exactcli needs Node.js 20 or newer.

## npm

```sh
npm install -g @wavyx/exactcli
exactcli --help
```

## Homebrew (macOS and Linux)

```sh
brew install wavyx/tap/exactcli
```

## One-off run

```sh
npx @wavyx/exactcli version
```

## Keychain

exactcli keeps the client secret and the tokens in the OS keychain: macOS Keychain,
Windows Credential Manager, or libsecret on Linux. It refuses to write them to a file.
Without a keychain, sign-in and writes fail by design.

## jq for `--jq`

The `--jq` filter needs the jq binary. A global npm install may skip the download of
node-jq, so install jq yourself and point exactcli at it:

```sh
brew install jq            # or: apt install jq, winget install jqlang.jq
export JQ_PATH=$(command -v jq)
```

Every other command works without jq. `exactcli doctor` checks the setup.

## Next step

[Sign in to Exact Online](/exactcli/guides/authentication/).
