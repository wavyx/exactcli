# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-08-19

First release.

### Added

- OAuth 2.0 authorization code login through a local callback behind an ngrok static
  domain, with a `--manual` paste fallback (`auth login`, `auth logout`, `auth status`).
- Token storage in the OS keychain, automatic refresh after 575 seconds, a cross-process
  lock around the single-use refresh token.
- Host-locked HTTP client with OData paging, rate-limit handling and deterministic
  sysexits exit codes.
- Generic `list`, `get` and `api` commands for any Exact Online resource.
- Typed `sales-entry list` and `purchase-entry list` commands.
- `me`, `division list`, `profile`, `config`, `doctor`, `version`.
- Output formats table, json, yaml, csv; `--jq` and `--fields` filters.

### Security

- The production launcher reads no `.env` file. Export the variables in your shell.

[0.1.0]: https://github.com/wavyx/exactcli/releases/tag/v0.1.0
