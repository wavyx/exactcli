---
title: Commands
description: Full command reference for the exactcli command-line interface.
---

<!-- AUTO-GENERATED from the oclif manifest by scripts/gen-commands.mjs - do not edit by hand. -->

Reference for `exactcli` v0.2.0 (29 commands). Every command also accepts the global flags `--output table|json|yaml|csv`, `--jq`, `--fields`, `--profile`, `--division`, `--no-color`, `--verbose`, `--no-retry`, `--timeout`, and `--limit`.

## Top-level

### `exactcli api`

Make a raw API request (host-locked to Exact Online)

```
exactcli api <method> <path> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--body <value>` - Request body (JSON string, @file, or piped stdin)
- `--query <value>` - Query parameter as key=value (repeatable)
- `--paginate` - Follow __next and collect every d.results into one array (GET only)
- `--max-pages <value>` - Maximum number of pages to read with --paginate

Examples:

```bash
exactcli api GET crm/Accounts
exactcli api GET /api/v1/current/Me
exactcli api GET "/api/v1/{division}/crm/Accounts" --query '$top=5'
exactcli api POST crm/Accounts --body '{"Name":"Acme"}' --allow-writes
exactcli api PUT "crm/Accounts(guid'<id>')" --body @patch.json --allow-writes
exactcli api DELETE "crm/Accounts(guid'<id>')" --allow-writes --yes
exactcli api GET logistics/Items --paginate --output json
exactcli api GET logistics/Items --paginate --max-pages 20
```

### `exactcli doctor`

Check the local setup: runtime, keychain, profile, ngrok, jq, token and API reachability. Exits 1 when a check fails.

```
exactcli doctor [flags]
```

- `--offline` - Skip the API reachability probe

Examples:

```bash
exactcli doctor
exactcli doctor --offline
exactcli doctor --output json
```

### `exactcli get`

Read one record of any Exact Online resource

```
exactcli get <resource> <id> [flags]
```

- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--beta` - Use the beta API namespace
- `--raw` - Print the raw API envelope

Examples:

```bash
exactcli get crm/Accounts 8f4b0e2a-1c3d-4e5f-9a7b-2c1d3e4f5a6b
exactcli get system/Divisions 123456
exactcli get crm/Accounts <id> --select Code,Name --output json
```

### `exactcli list`

List the records of any Exact Online resource

```
exactcli list <resource> [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--beta` - Use the beta API namespace

Examples:

```bash
exactcli list crm/Accounts
exactcli list crm/Accounts --filter "Status eq 'C'" --top 20
exactcli list financial/GLAccounts --all --output json
exactcli list logistics/Items --select Code,Description --limit 200
```

### `exactcli mcp`

Run exactcli as a Model Context Protocol (MCP) server over stdio.

Exposes six generic tools that cover every resource of the catalogue
(exact_resources, exact_metadata, exact_list, exact_get, exact_me,
exact_quota) plus one tool per typed command. Mutating tools stay hidden
unless --allow-writes is set. Each tool call runs exactcli as a child
process under the profile and division of the server.

Register with Claude Code:
  claude mcp add exact -- exactcli mcp

Or in .mcp.json / claude_desktop_config.json:
  {"mcpServers":{"exact":{"command":"exactcli","args":["mcp"]}}}

```
exactcli mcp [flags]
```

- `--allow-writes` - Expose mutating tools. Off by default: the server is read-only.
- `--all-tools` - Expose every command as a tool, not only the generic and typed set
- `--tool-timeout <value>` - Seconds a tool call may run before its child process is terminated

Examples:

```bash
exactcli mcp
exactcli mcp --division 123456
exactcli mcp --all-tools --allow-writes
```

### `exactcli me`

Show the current user and session

```
exactcli me [flags]
```

- `--raw` - Print the raw API envelope

Examples:

```bash
exactcli me
exactcli me --raw
exactcli me --output json
```

### `exactcli metadata`

Show the fields of a resource, or search the resource catalogue

```
exactcli metadata [resource] [flags]
```

- `--search <value>` - Search the catalogue for resources that match a word
- `--mandatory` - Only the mandatory properties
- `--filterable` - Only the properties that $filter accepts
- `--methods` - Show the resource summary instead of the properties

Examples:

```bash
exactcli metadata crm/Accounts
exactcli metadata crm/Accounts --mandatory
exactcli metadata --search invoice
exactcli metadata salesentry/SalesEntries --methods --output json
```

### `exactcli quota`

Show the rate-limit budget of the division (one cheap call)

```
exactcli quota [flags]
```

Examples:

```bash
exactcli quota
exactcli quota --output json
```

### `exactcli version`

Show the CLI version and runtime

```
exactcli version [flags]
```

Examples:

```bash
exactcli version
exactcli version --output json
```

## exactcli account

### `exactcli account list`

List accounts (customers and suppliers)

```
exactcli account list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--search <value>` - Name contains, or exact Code
- `--status <value>` - Status code, for example C
- `--customer <value>` - Customers only (true or false)
- `--supplier <value>` - Suppliers only (true or false)

Examples:

```bash
exactcli account list --search acme
exactcli account list --customer yes --status C --all
```

## exactcli auth

### `exactcli auth login`

Authenticate with Exact Online (OAuth 2.0 authorization code)

```
exactcli auth login [flags]
```

- `--host <value>` - Exact Online country host (default: the host of the profile, else start.exactonline.be)
- `--ngrok-domain <value>` - Reserved ngrok domain in front of the callback, for example acme.ngrok-free.app
- `--port <value>` - Local port that receives the callback
- `--client-id <value>` - OAuth client ID (env EXACTCLI_CLIENT_ID)
- `--client-secret <value>` - OAuth client secret (env EXACTCLI_CLIENT_SECRET). Prefer the prompt: flags stay in shell history
- `--manual` - Paste the redirected URL instead of catching the callback on a local port

Examples:

```bash
exactcli auth login
exactcli auth login --host start.exactonline.nl
exactcli auth login --ngrok-domain acme.ngrok-free.app
exactcli auth login --manual
```

### `exactcli auth logout`

Remove the stored credentials of the profile

```
exactcli auth logout [flags]
```

Examples:

```bash
exactcli auth logout
exactcli auth logout --profile acme
```

### `exactcli auth status`

Show the authentication status of the profile

```
exactcli auth status [flags]
```

Examples:

```bash
exactcli auth status
exactcli auth status --output json
```

## exactcli config

### `exactcli config get`

Get a config value for the active profile

```
exactcli config get <key> [flags]
```

Examples:

```bash
exactcli config get host
exactcli config get division
```

### `exactcli config list`

List all config for the active profile

```
exactcli config list [flags]
```

Examples:

```bash
exactcli config list
```

### `exactcli config set`

Set a config value for the active profile

```
exactcli config set <key> <value> [flags]
```

Examples:

```bash
exactcli config set host start.exactonline.be
exactcli config set division 123456
```

### `exactcli config unset`

Remove a config key from the active profile

```
exactcli config unset <key> [flags]
```

Examples:

```bash
exactcli config unset default_output
```

## exactcli division

### `exactcli division current`

Show the division (administration) in use

```
exactcli division current [flags]
```

Examples:

```bash
exactcli division current
exactcli division current --output json
```

### `exactcli division list`

List the divisions (administrations) of the account

```
exactcli division list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope

Examples:

```bash
exactcli division list
exactcli division list --all
exactcli division list --output json
```

### `exactcli division use`

Make a division (administration) the default of the profile

```
exactcli division use <code> [flags]
```

Examples:

```bash
exactcli division use 123456
exactcli division use 123456 --profile acme
```

## exactcli document

### `exactcli document download`

Download the attachments of a document

```
exactcli document download <id> [flags]
```

- `--out <value>` - Target directory
- `--force` - Overwrite files that exist

Examples:

```bash
exactcli document download <id>
exactcli document download <id> --out ./attachments --force
```

### `exactcli document list`

List documents

```
exactcli document list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--account <value>` - Account GUID or code
- `--type <value>` - Document type code
- `--from <value>` - Document date from (YYYY-MM-DD)
- `--to <value>` - Document date to (YYYY-MM-DD)

Examples:

```bash
exactcli document list --from 2026-01-01
exactcli document list --account 1001 --type 10
```

## exactcli gl-account

### `exactcli gl-account list`

List general ledger accounts

```
exactcli gl-account list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--type <value>` - Account type code
- `--search <value>` - Description contains, or exact Code

Examples:

```bash
exactcli gl-account list --all
exactcli gl-account list --search bank --type 12
```

## exactcli profile

### `exactcli profile current`

Show the active profile

```
exactcli profile current [flags]
```

Examples:

```bash
exactcli profile current
```

### `exactcli profile list`

List all configured profiles

```
exactcli profile list [flags]
```

Examples:

```bash
exactcli profile list
```

### `exactcli profile use`

Switch the active profile

```
exactcli profile use <name> [flags]
```

Examples:

```bash
exactcli profile use work
```

## exactcli purchase-entry

### `exactcli purchase-entry list`

List purchase entries (the accounting ledger of purchases)

```
exactcli purchase-entry list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope

Examples:

```bash
exactcli purchase-entry list
exactcli purchase-entry list --filter "EntryDate ge datetime'2026-01-01'" --all
exactcli purchase-entry list --limit 200 --output json
```

## exactcli sales-entry

### `exactcli sales-entry list`

List sales entries (the accounting ledger of sales)

```
exactcli sales-entry list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope

Examples:

```bash
exactcli sales-entry list
exactcli sales-entry list --filter "EntryDate ge datetime'2026-01-01'" --all
exactcli sales-entry list --limit 200 --output json
```

## exactcli transaction-line

### `exactcli transaction-line list`

List transaction lines (general ledger detail)

```
exactcli transaction-line list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--year <value>` - Financial year
- `--period <value>` - Financial period
- `--from <value>` - Date from (YYYY-MM-DD)
- `--to <value>` - Date to (YYYY-MM-DD)
- `--gl-account <value>` - General ledger account code
- `--account <value>` - Account GUID or code
- `--journal <value>` - Journal code

Examples:

```bash
exactcli transaction-line list --year 2026 --period 9
exactcli transaction-line list --from 2026-01-01 --to 2026-01-31 --gl-account 700000
exactcli transaction-line list --account 1001 --all --output csv
```

