# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-09-03

Catalogue date: 2026-08-19 (435 resources).

### Added

- `create`, `update`, `delete`: generic writes validated against the catalogue,
  with `--body`, repeatable `--set Key=value`, `@ref:` markers that resolve a code
  to a GUID, and `--dry-run`.
- `sync <resource>`, `deleted`, `sync timestamp`: incremental reads with a
  `--state` file that remembers the last timestamp.
- `list --bulk`: the bulk API, 1000 rows per page.
- `exact_write` MCP tool, registered only under `--allow-writes`.

### Changed

- Numeric codes are padded to 18 characters in exact-code searches and lookups,
  as Exact stores them.

## [0.2.0] - 2026-09-03

Catalogue date: 2026-08-19 (435 resources).

### Added

- An embedded catalogue of the Exact Online REST resources, and the `metadata`
  command to search it and to show the fields of a resource.
- `list` selects readable default columns for a known resource; `get` follows the
  key type of the resource; an unknown path warns and still goes out.
- `quota`, `division use`, `division current`; `division list` marks the active one.
- Typed commands: `transaction-line list`, `account list`, `gl-account list`,
  `document list`, `document download`. `sales-entry list` and `purchase-entry
list` now share the same descriptor factory.
- `mcp`: a read-only Model Context Protocol server with six generic tools and one
  tool per typed command.
- The api command routes `current/...` without a division.

### Security

- Writes are off by default: `api POST|PUT|DELETE` need `--allow-writes`, a DELETE
  needs `--yes` as well. `doctor` reports the switch.
- The OAuth callback requires the `state` echo.

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

[0.3.0]: https://github.com/wavyx/exactcli/releases/tag/v0.3.0
[0.2.0]: https://github.com/wavyx/exactcli/releases/tag/v0.2.0
[0.1.0]: https://github.com/wavyx/exactcli/releases/tag/v0.1.0
