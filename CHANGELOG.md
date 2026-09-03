# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [0.6.0] - 2026-09-03

Catalogue date: 2026-08-19 (435 resources).

### Added

- Typed lists: `receivables-list`, `payables-list`, `revenue`, `aging-overview`,
  `purchase-order`, `goods-delivery`, `item-group`, `cost-center`, `cost-unit`,
  `project`, `budget`, `asset`, `subscription`, `cash-entry`.
- Typed writes from codes: `item create`, `contact create`, `quotation create`,
  `purchase-invoice create`, `purchase-order create`, `bank-entry create`,
  `sales-order invoice`.
- `exact_probe` MCP tool.
- `config set read_only true`: a profile lock that refuses every write.

### Fixed

- A digits-only `--search` on a resource without a `Code` field searches the text
  field instead of sending a `Code` filter that Exact rejects.

## [0.5.0] - 2026-09-03

Catalogue date: 2026-08-19 (435 resources).

### Added

- Typed lists: `balance`, `financial-period`, `gl-classification`, `aging-receivable`,
  `aging-payable`, `profit-loss`, `sales-order`, `quotation`, `payment`,
  `bank-account`, `address`, `webhook`, `currency`, `exchange-rate`.
- Typed writes from codes: `account create`, `sales-entry create`,
  `purchase-entry create`, `sales-order create`, `webhook create`, `webhook delete`.
- `probe <resource>`: what the server returns next to what the catalogue says.
- `docs/recipes.md`: twelve end-to-end recipes, each step marked "Verified live" or
  "From the documentation".

## [0.4.0] - 2026-09-03

Catalogue date: 2026-08-19 (435 resources).

### Added

- Typed lists: `journal`, `vat-code`, `item`, `contact`, `sales-invoice`,
  `purchase-invoice`, `bank-entry`, `journal-entry`, `receivable`,
  `payment-condition`, `document-type`. Each is an MCP tool too.
- Typed writes from codes: `invoice create`, `journal-entry create` (balanced lines,
  `AmountFC`), `document create --file` (document plus attachments).
- `document download` fetches the bytes through the attachment Url with `Download=1`.

### Fixed

- `auth status` refreshes a token past its refresh point before the identity probe.
- Reference lookups select the label field the resource has (`Description` on a
  ledger account or an item).

## [0.3.0] - 2026-09-03

Catalogue date: 2026-08-19 (435 resources).

### Added

- `create`, `update`, `delete`: generic writes validated against the catalogue,
  with `--body`, repeatable `--set Key=value`, `@ref:` markers that resolve a code
  to a GUID, and `--dry-run`.
- `sync <resource>`, `deleted`: incremental reads with a `--state` file that
  remembers the last timestamp; `sync timestamp` turns a date into a timestamp.
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

[0.6.0]: https://github.com/wavyx/exactcli/releases/tag/v0.6.0
[0.5.0]: https://github.com/wavyx/exactcli/releases/tag/v0.5.0
[0.4.0]: https://github.com/wavyx/exactcli/releases/tag/v0.4.0
[0.3.0]: https://github.com/wavyx/exactcli/releases/tag/v0.3.0
[0.2.0]: https://github.com/wavyx/exactcli/releases/tag/v0.2.0
[0.1.0]: https://github.com/wavyx/exactcli/releases/tag/v0.1.0
