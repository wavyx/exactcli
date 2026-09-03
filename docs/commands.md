---
title: Commands
description: Full command reference for the exactcli command-line interface.
---

<!-- AUTO-GENERATED from the oclif manifest by scripts/gen-commands.mjs - do not edit by hand. -->

Reference for `exactcli` v0.5.0 (70 commands). Every command also accepts the global flags `--output table|json|yaml|csv`, `--jq`, `--fields`, `--profile`, `--division`, `--no-color`, `--verbose`, `--no-retry`, `--timeout`, and `--limit`.

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

### `exactcli create`

Create a record (POST), validated against the catalogue

```
exactcli create <resource> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--body <value>` - Request body (JSON string, @file, or piped stdin)
- `--set <value>` - Field as Key=value (repeatable). Values: text, number, true, false, null, @str:text, @guid:id, @ref:service/Resource:code
- `--dry-run` - Show the validated request and send nothing
- `--force` - Send even when the resource or a field is not in the catalogue
- `--beta` - Use the beta API namespace

Examples:

```bash
exactcli create crm/Accounts --set Name=Acme --set Code=1001 --dry-run
exactcli create crm/Accounts --set Name=Acme --allow-writes
exactcli create salesentry/SalesEntries --body @entry.json --set Customer=@ref:crm/Accounts:1001 --allow-writes
```

### `exactcli delete`

Delete a record (DELETE). Needs --allow-writes and --yes

```
exactcli delete <resource> <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the request and send nothing
- `--force` - Send even when the resource is not in the catalogue
- `--beta` - Use the beta API namespace

Examples:

```bash
exactcli delete crm/Accounts <id> --dry-run
exactcli delete crm/Accounts <id> --allow-writes --yes
```

### `exactcli deleted`

Read the records deleted since a timestamp (sync/Deleted); pair it with sync

```
exactcli deleted [flags]
```

- `--since <value>` - Timestamp to start after (from the last run). Default: the state file, else 0
- `--state <value>` - JSON file that remembers the last timestamp per resource; read when --since is absent, written after a complete run
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--type <value>` - Only this EntityType code

Examples:

```bash
exactcli deleted --since 0
exactcli deleted --state ./sync.json --type 10
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
- `--bulk` - Read the bulk variant: 1000 rows per page, $select required

Examples:

```bash
exactcli list crm/Accounts
exactcli list crm/Accounts --filter "Status eq 'C'" --top 20
exactcli list financial/GLAccounts --all --output json
exactcli list logistics/Items --select Code,Description --limit 200
exactcli list crm/Accounts --bulk --all --output csv
```

### `exactcli mcp`

Run exactcli as a Model Context Protocol (MCP) server over stdio.

Exposes six generic tools that cover every resource of the catalogue
(exact_resources, exact_metadata, exact_list, exact_get, exact_me,
exact_quota) plus one tool per typed command. --allow-writes adds
exact_write (create, update, delete with dry_run and confirm). Each tool
call runs exactcli as a child process under the profile and division of
the server.

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

### `exactcli probe`

Compare the fields a resource really returns with the catalogue

```
exactcli probe <resource> [flags]
```

- `--top <value>` - Records to fetch, 1 to 60
- `--filter <value>` - OData $filter expression
- `--beta` - Use the beta API namespace

Examples:

```bash
exactcli probe crm/Accounts
exactcli probe financialtransaction/Transactions --top 5
exactcli probe crm/Accounts --filter "Status eq 'C'" --output json
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

### `exactcli sync`

Read the records changed since a timestamp (the sync API, 1000 per page)

```
exactcli sync <resource> [flags]
```

- `--since <value>` - Timestamp to start after (from the last run). Default: the state file, else 0
- `--state <value>` - JSON file that remembers the last timestamp per resource; read when --since is absent, written after a complete run
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--select <value>` - Comma-separated properties for $select

Examples:

```bash
exactcli sync crm/Accounts --since 0
exactcli sync crm/Accounts --state ./sync.json
exactcli sync financialtransaction/TransactionLines --state ./sync.json --output csv
```

### `exactcli update`

Update a record (PUT), validated against the catalogue

```
exactcli update <resource> <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--body <value>` - Request body (JSON string, @file, or piped stdin)
- `--set <value>` - Field as Key=value (repeatable). Values: text, number, true, false, null, @str:text, @guid:id, @ref:service/Resource:code
- `--dry-run` - Show the validated request and send nothing
- `--force` - Send even when the resource or a field is not in the catalogue
- `--beta` - Use the beta API namespace

Examples:

```bash
exactcli update crm/Accounts <id> --set Name="Acme NV" --allow-writes
exactcli update crm/Accounts <id> --body @patch.json --dry-run
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

### `exactcli account create`

Create an account, customer or supplier (POST crm/Accounts)

```
exactcli account create [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--name <value>` _(required)_ - Account name
- `--code <value>` - Account code (numeric in Belgium; Exact pads it)
- `--customer <value>` - Customer: true, false, yes, no, 1 or 0 (IsSales)
- `--supplier <value>` - Supplier: true, false, yes, no, 1 or 0 (IsSupplier)
- `--vat-number <value>` - VAT number, for example BE0123456789
- `--email <value>` - E-mail address
- `--phone <value>` - Phone number
- `--website <value>` - Website
- `--address <value>` - Visit address, first line
- `--postcode <value>` - Visit address postcode
- `--city <value>` - Visit address city
- `--country <value>` - Country code, 2 letters, for example BE
- `--status <value>` - Customer status: A none, S suspect, P prospect, C customer
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli account create --name Acme --customer true --status C --dry-run
exactcli account create --name Acme --code 1001 --customer true --status C --country BE --allow-writes
```

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

## exactcli address

### `exactcli address list`

List addresses of customers and suppliers

```
exactcli address list [flags]
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
- `--type <value>` - Address type: 1 visit, 2 postal, 3 invoice, 4 delivery
- `--city <value>` - City (exact match)
- `--main <value>` - Main address of its type only (true or false)

Examples:

```bash
exactcli address list --account 1001
exactcli address list --type 3 --city Brussels --main yes --all
```

## exactcli aging-payable

### `exactcli aging-payable list`

List aged payables per supplier (open amounts by age group)

```
exactcli aging-payable list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--search <value>` - Account name contains (a code goes to --account)
- `--account <value>` - Account GUID or code

Examples:

```bash
exactcli aging-payable list --search acme
exactcli aging-payable list --account 2001 --output json
```

## exactcli aging-receivable

### `exactcli aging-receivable list`

List aged receivables per customer (open amounts by age group)

```
exactcli aging-receivable list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--search <value>` - Account name contains (a code goes to --account)
- `--account <value>` - Account GUID or code

Examples:

```bash
exactcli aging-receivable list --search acme
exactcli aging-receivable list --account 1001 --output json
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

## exactcli balance

### `exactcli balance list`

List the trial balance per ledger account and period

```
exactcli balance list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--year <value>` - Reporting year
- `--period <value>` - Reporting period
- `--gl-account <value>` - Ledger account code, for example 700000
- `--type <value>` - Balance type: B balance sheet, W profit and loss
- `--status <value>` - Status code: 20 open, 50 processed

Examples:

```bash
exactcli balance list --year 2026 --all
exactcli balance list --year 2026 --period 3 --type W
```

## exactcli bank-account

### `exactcli bank-account list`

List bank accounts of customers and suppliers

```
exactcli bank-account list [flags]
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
- `--main <value>` - Main bank account only (true or false)
- `--search <value>` - Bank account number contains

Examples:

```bash
exactcli bank-account list --account 1001
exactcli bank-account list --main yes --all --output csv
```

## exactcli bank-entry

### `exactcli bank-entry list`

List bank entries (bank statement headers)

```
exactcli bank-entry list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--journal <value>` - Bank journal code
- `--year <value>` - Financial year
- `--period <value>` - Financial period

Examples:

```bash
exactcli bank-entry list --journal 55 --year 2026
exactcli bank-entry list --year 2026 --period 9 --all --output csv
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

## exactcli contact

### `exactcli contact list`

List contacts (the persons of an account)

```
exactcli contact list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--search <value>` - Full name contains, or exact Code
- `--account <value>` - Account GUID or code
- `--email <value>` - Exact email address
- `--since <value>` - Modified on or after (YYYY-MM-DD)

Examples:

```bash
exactcli contact list --search jane
exactcli contact list --account 1001 --output json
```

## exactcli currency

### `exactcli currency list`

List currencies (the currency codes of the division)

```
exactcli currency list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--search <value>` - Description contains
- `--since <value>` - Modified on or after (YYYY-MM-DD)

Examples:

```bash
exactcli currency list
exactcli currency list --search euro --output json
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

### `exactcli document create`

Create a document and attach files

```
exactcli document create [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--subject <value>` _(required)_ - Document subject
- `--type <value>` _(required)_ - Document type code (183 Attachment, 55 Miscellaneous)
- `--account <value>` - Account GUID or code
- `--file <value>` - File to attach (repeatable)
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli document create --subject "Invoice 2026-001" --type 183 --file invoice.pdf --dry-run
exactcli document create --subject "Invoice 2026-001" --type 183 --account 1001 --file invoice.pdf --allow-writes
```

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

## exactcli document-type

### `exactcli document-type list`

List document types (the Type codes of documents)

```
exactcli document-type list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--search <value>` - Description contains
- `--creatable <value>` - Types a POST on documents/Documents accepts (true or false)
- `--category <value>` - Document type category ID

Examples:

```bash
exactcli document-type list --creatable yes
exactcli document-type list --search invoice --output json
```

## exactcli exchange-rate

### `exactcli exchange-rate list`

List exchange rates (one rate per currency pair and start date)

```
exactcli exchange-rate list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--source <value>` - Foreign currency code, for example USD
- `--target <value>` - Division currency code, for example EUR
- `--from <value>` - Start date from (YYYY-MM-DD)
- `--to <value>` - Start date to (YYYY-MM-DD)

Examples:

```bash
exactcli exchange-rate list --source USD
exactcli exchange-rate list --from 2026-01-01 --to 2026-03-31 --all
```

## exactcli financial-period

### `exactcli financial-period list`

List financial periods (the bookkeeping calendar)

```
exactcli financial-period list [flags]
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
- `--from <value>` - Start date from (YYYY-MM-DD)
- `--to <value>` - Start date to (YYYY-MM-DD)

Examples:

```bash
exactcli financial-period list --year 2026
exactcli financial-period list --from 2026-01-01 --to 2026-12-31
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

## exactcli gl-classification

### `exactcli gl-classification list`

List ledger classifications (the reporting scheme elements)

```
exactcli gl-classification list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--search <value>` - Description contains, or exact Code
- `--parent <value>` - Parent element GUID
- `--namespace <value>` - Taxonomy namespace GUID (the reporting scheme)
- `--abstract <value>` - Group elements only (true or false)

Examples:

```bash
exactcli gl-classification list --search turnover
exactcli gl-classification list --parent <guid> --all
```

## exactcli invoice

### `exactcli invoice create`

Create a sales invoice from codes (POST salesinvoice/SalesInvoices)

```
exactcli invoice create [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--customer <value>` _(required)_ - Customer code or GUID (crm/Accounts with IsSales)
- `--journal <value>` _(required)_ - Sales journal code, for example 700
- `--line <value>` _(required)_ - Invoice line as item:quantity:unit price[:description] (repeatable)
- `--description <value>` - Invoice description
- `--date <value>` - Invoice date (YYYY-MM-DD)
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli invoice create --customer 1001 --journal 700 --line Default:2:100 --dry-run
exactcli invoice create --customer 1001 --journal 700 --line Default:2:100 --allow-writes
```

## exactcli item

### `exactcli item list`

List items (products and services)

```
exactcli item list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--search <value>` - Description contains, or exact Code
- `--sales <value>` - Sales items only (true or false)
- `--purchase <value>` - Purchase items only (true or false)
- `--stock <value>` - Stock items only (true or false)

Examples:

```bash
exactcli item list --search widget
exactcli item list --sales yes --stock yes --all
```

## exactcli journal

### `exactcli journal list`

List journals (cash, bank, sales, purchase, general)

```
exactcli journal list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--search <value>` - Description contains, or exact Code
- `--type <value>` - Journal type: 10 cash, 12 bank, 16 payment service, 20 sales, 22 purchase, 90 general

Examples:

```bash
exactcli journal list
exactcli journal list --type 12 --search bank
```

## exactcli journal-entry

### `exactcli journal-entry create`

Post a general journal entry (OD) from ledger account codes

```
exactcli journal-entry create [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--journal <value>` _(required)_ - Journal code, for example 800
- `--line <value>` _(required)_ - Line as <gl account>:<amount>[:description] (repeatable, at least two). The account is a code or a GUID; debit is positive, credit negative
- `--date <value>` - Date of every line (YYYY-MM-DD)
- `--description <value>` - Description of the lines that carry none
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli journal-entry create --journal 800 --line 499000:50:Rent --line 580600:-50 --dry-run
exactcli journal-entry create --journal 800 --line 499000:50 --line 580600:-50 --date 2026-09-03 --allow-writes
```

### `exactcli journal-entry list`

List general journal entries (manual bookings)

```
exactcli journal-entry list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--journal <value>` - Journal code
- `--year <value>` - Financial year
- `--period <value>` - Financial period
- `--status <value>` - Status code, for example 20 (open) or 50 (processed)

Examples:

```bash
exactcli journal-entry list --journal 800 --year 2026
exactcli journal-entry list --year 2026 --period 9 --status 20 --all
```

## exactcli payment

### `exactcli payment list`

List payments (outstanding supplier items to pay)

```
exactcli payment list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--account <value>` - Supplier GUID or code
- `--due-from <value>` - Due date from (YYYY-MM-DD)
- `--due-to <value>` - Due date to (YYYY-MM-DD)
- `--status <value>` - Status: 20 open, 30 selected, 40 processed, 50 matched
- `--search <value>` - Description contains

Examples:

```bash
exactcli payment list --status 20 --due-to 2026-09-30
exactcli payment list --account 2001 --all --output csv
```

## exactcli payment-condition

### `exactcli payment-condition list`

List payment conditions

```
exactcli payment-condition list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--search <value>` - Description contains, or exact Code
- `--method <value>` - Payment method: B on credit, I collection, K cash, Q PSP
- `--days <value>` - Payment days

Examples:

```bash
exactcli payment-condition list
exactcli payment-condition list --method B --days 30
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

## exactcli profit-loss

### `exactcli profit-loss list`

List the profit and loss overview (revenue, costs and result of the current year and period)

```
exactcli profit-loss list [flags]
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
exactcli profit-loss list
exactcli profit-loss list --output json
```

## exactcli purchase-entry

### `exactcli purchase-entry create`

Post a purchase entry from codes (POST purchaseentry/PurchaseEntries)

```
exactcli purchase-entry create [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--supplier <value>` _(required)_ - Supplier code or GUID (crm/Accounts with IsSupplier)
- `--journal <value>` _(required)_ - Purchase journal code, for example 600
- `--line <value>` _(required)_ - Line as <gl account>:<amount>[:description] (repeatable). The account is a code or a GUID; the amount is a decimal
- `--description <value>` - Entry description
- `--date <value>` - Entry date (YYYY-MM-DD)
- `--invoice <value>` - Invoice number (InvoiceNumber)
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli purchase-entry create --supplier 1001 --journal 600 --line 700000:100 --dry-run
exactcli purchase-entry create --supplier 1001 --journal 600 --line 700000:100 --allow-writes
```

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

## exactcli purchase-invoice

### `exactcli purchase-invoice list`

List purchase invoices (the invoices received from suppliers)

```
exactcli purchase-invoice list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--supplier <value>` - Supplier GUID or code
- `--from <value>` - Invoice date from (YYYY-MM-DD)
- `--to <value>` - Invoice date to (YYYY-MM-DD)
- `--status <value>` - Status code: 10 draft, 20 open, 50 processed

Examples:

```bash
exactcli purchase-invoice list --from 2026-01-01 --to 2026-01-31
exactcli purchase-invoice list --supplier 2001 --status 20 --output json
```

## exactcli quotation

### `exactcli quotation list`

List quotations (the offers sent to prospects and customers)

```
exactcli quotation list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--account <value>` - Account GUID or code (the account that requested the quotation)
- `--from <value>` - Quotation date from (YYYY-MM-DD)
- `--to <value>` - Quotation date to (YYYY-MM-DD)
- `--status <value>` - Status code: 5 rejected, 20 draft, 25 open, 40 printed, 50 accepted
- `--search <value>` - Description contains

Examples:

```bash
exactcli quotation list --from 2026-01-01 --to 2026-01-31
exactcli quotation list --account 1001 --status 25 --all
```

## exactcli receivable

### `exactcli receivable list`

List receivables (outstanding customer items)

```
exactcli receivable list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--search <value>` - Description contains
- `--account <value>` - Account GUID or code
- `--due-from <value>` - Due date from (YYYY-MM-DD)
- `--due-to <value>` - Due date to (YYYY-MM-DD)
- `--status <value>` - Status: 20 open, 30 selected, 40 processed, 50 matched

Examples:

```bash
exactcli receivable list --status 20 --due-to 2026-09-30
exactcli receivable list --account 1001 --all --output csv
```

## exactcli sales-entry

### `exactcli sales-entry create`

Post a sales entry from codes (POST salesentry/SalesEntries)

```
exactcli sales-entry create [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--customer <value>` _(required)_ - Customer code or GUID (crm/Accounts with IsSales)
- `--journal <value>` _(required)_ - Sales journal code, for example 700
- `--line <value>` _(required)_ - Line as <gl account>:<amount>[:description] (repeatable). The account is a code or a GUID; the amount is a decimal
- `--description <value>` - Entry description
- `--date <value>` - Entry date (YYYY-MM-DD)
- `--invoice <value>` - Invoice reference (YourRef)
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli sales-entry create --customer 1001 --journal 700 --line 700000:100 --dry-run
exactcli sales-entry create --customer 1001 --journal 700 --line 700000:100 --allow-writes
```

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

## exactcli sales-invoice

### `exactcli sales-invoice list`

List sales invoices (the invoices sent to customers)

```
exactcli sales-invoice list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--customer <value>` - Customer GUID or code (the account that ordered)
- `--from <value>` - Invoice date from (YYYY-MM-DD)
- `--to <value>` - Invoice date to (YYYY-MM-DD)
- `--status <value>` - Status code: 10 draft, 20 open, 50 processed
- `--search <value>` - Description contains

Examples:

```bash
exactcli sales-invoice list --from 2026-01-01 --to 2026-01-31
exactcli sales-invoice list --customer 1001 --status 20 --all
```

## exactcli sales-order

### `exactcli sales-order create`

Create a sales order from codes (POST salesorder/SalesOrders)

```
exactcli sales-order create [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--customer <value>` _(required)_ - Customer code or GUID (crm/Accounts with IsSales)
- `--line <value>` _(required)_ - Order line as item:quantity:unit price[:description] (repeatable)
- `--description <value>` - Order description
- `--date <value>` - Order date (YYYY-MM-DD)
- `--delivery-date <value>` - Delivery date (YYYY-MM-DD)
- `--reference <value>` - Reference of the customer (YourRef)
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli sales-order create --customer 1001 --line Default:2:100 --dry-run
exactcli sales-order create --customer 1001 --line Default:2:100 --delivery-date 2026-09-10 --allow-writes
```

### `exactcli sales-order list`

List sales orders (the orders placed by customers)

```
exactcli sales-order list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--customer <value>` - Customer GUID or code (the account that ordered)
- `--from <value>` - Order date from (YYYY-MM-DD)
- `--to <value>` - Order date to (YYYY-MM-DD)
- `--status <value>` - Status code: 12 open, 20 partial, 21 complete, 45 cancelled
- `--search <value>` - Description contains

Examples:

```bash
exactcli sales-order list --from 2026-01-01 --to 2026-01-31
exactcli sales-order list --customer 1001 --status 12 --all
```

## exactcli sync

### `exactcli sync timestamp`

Find the sync timestamp of a date for one feed, to start a sync from that date

```
exactcli sync timestamp [flags]
```

- `--endpoint <value>` _(required)_ - Feed name, for example Accounts or TransactionLines (the list: metadata read/sync/Sync/SyncTimestamp)
- `--modified <value>` _(required)_ - Date (YYYY-MM-DD): the first timestamp at or after it

Examples:

```bash
exactcli sync timestamp --endpoint Accounts --modified 2026-01-01
exactcli sync timestamp --endpoint TransactionLines --modified 2026-01-01 --output json
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

## exactcli vat-code

### `exactcli vat-code list`

List VAT codes

```
exactcli vat-code list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--search <value>` - Description contains, or exact Code
- `--type <value>` - Calculation type: B (base only), E (excluding), I (including), N (no VAT)
- `--blocked <value>` - Blocked codes only (true or false)

Examples:

```bash
exactcli vat-code list
exactcli vat-code list --type E --blocked no
```

## exactcli webhook

### `exactcli webhook create`

Subscribe to a webhook topic (POST webhooks/WebhookSubscriptions)

```
exactcli webhook create [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--topic <value>` _(required)_ - Topic, for example Accounts or SalesInvoices
- `--url <value>` _(required)_ - Callback URL (https only)
- `--description <value>` - Description of the subscription
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli webhook create --topic Accounts --url https://acme.example/hooks/exact --dry-run
exactcli webhook create --topic SalesInvoices --url https://acme.example/hooks/exact --allow-writes
```

### `exactcli webhook delete`

Delete a webhook subscription (DELETE webhooks/WebhookSubscriptions). Needs --allow-writes and --yes

```
exactcli webhook delete <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the request and send nothing

Examples:

```bash
exactcli webhook delete <id> --dry-run
exactcli webhook delete <id> --allow-writes --yes
```

### `exactcli webhook list`

List webhook subscriptions (the callbacks Exact calls per topic)

```
exactcli webhook list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--topic <value>` - Subscription topic, for example Accounts or Items
- `--search <value>` - Description contains
- `--instant <value>` - Instant delivery subscriptions only (true or false)

Examples:

```bash
exactcli webhook list --topic Accounts
exactcli webhook list --search acme --output json
```

