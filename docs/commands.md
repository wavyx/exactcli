---
title: Commands
description: Full command reference for the exactcli command-line interface.
---

<!-- AUTO-GENERATED from the oclif manifest by scripts/gen-commands.mjs - do not edit by hand. -->

Reference for `exactcli` v0.11.1 (128 commands). Every command also accepts the global flags `--output table|json|yaml|csv`, `--jq`, `--fields`, `--profile`, `--division`, `--no-color`, `--verbose`, `--no-retry`, `--timeout`, and `--limit`.

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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--beta` - Use the beta API namespace
- `--bulk` - Read the bulk variant: 1000 rows per page, $select required

Examples:

```bash
exactcli list crm/Accounts
exactcli list crm/Accounts --filter "Status eq 'C'" --top 20
exactcli list financial/GLAccounts --all --output json
exactcli list logistics/Items --select Code,Description --limit 200
exactcli list crm/Accounts --bulk --all --output csv
exactcli list crm/Accounts --filter "Status eq 'C'" --count
```

### `exactcli mcp`

Run exactcli as a Model Context Protocol (MCP) server over stdio.

Exposes seven generic tools that cover every resource of the catalogue
(exact_resources, exact_metadata, exact_list, exact_get, exact_probe,
exact_me, exact_quota) plus one tool per typed command. --allow-writes adds
exact_write (create, update, delete with dry_run and confirm). With
--all-tools, a delete tool needs confirm: true. Each tool call runs
exactcli as a child process under the profile and division of the server.

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

Show the current user and session (GET current/Me)

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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--search <value>` - Name contains, or exact Code
- `--status <value>` - Status code, for example C
- `--customer <value>` - Customers only (true or false)
- `--supplier <value>` - Suppliers only (true or false)

Examples:

```bash
exactcli account list --search acme
exactcli account list --customer yes --status C --all
```

### `exactcli account update`

Update the given fields of an account (PUT crm/Accounts)

```
exactcli account update <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--name <value>` - Account name
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
exactcli account update 1001 --name "Acme NV" --city Ghent --dry-run
exactcli account update <id> --status C --customer true --allow-writes
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--account <value>` - Account GUID or code
- `--type <value>` - Address type: 1 visit, 2 postal, 3 invoice, 4 delivery
- `--city <value>` - City (exact match)
- `--main <value>` - Main address of its type only (true or false)

Examples:

```bash
exactcli address list --account 1001
exactcli address list --type 3 --city Brussels --main yes --all
```

## exactcli aging-overview

### `exactcli aging-overview list`

List open receivables and payables per age group

```
exactcli aging-overview list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--age-group <value>` - Age group number, 1 is the youngest
- `--currency <value>` - Currency code, for example EUR

Examples:

```bash
exactcli aging-overview list
exactcli aging-overview list --currency EUR --output json
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--search <value>` - Account name contains (a code goes to --account)
- `--account <value>` - Account GUID or code

Examples:

```bash
exactcli aging-receivable list --search acme
exactcli aging-receivable list --account 1001 --output json
```

## exactcli assembly-order

### `exactcli assembly-order finish`

Finish an assembly order for a quantity (POST inventory/FinishAssemblyOrder)

```
exactcli assembly-order finish <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing
- `--quantity <value>` _(required)_ - Quantity finished
- `--date <value>` - Assembly date (YYYY-MM-DD)
- `--description <value>` - Description of the assembly order
- `--notes <value>` - Notes
- `--location <value>` - Storage location (GUID) of the assembled item

Examples:

```bash
exactcli assembly-order finish <id> --quantity 10 --dry-run
exactcli assembly-order finish <id> --quantity 10 --allow-writes
```

## exactcli asset

### `exactcli asset list`

List fixed assets (investments and their depreciation status)

```
exactcli asset list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--search <value>` - Description contains, or exact Code
- `--status <value>` - Status code
- `--from <value>` - Start date from (YYYY-MM-DD)
- `--to <value>` - Start date to (YYYY-MM-DD)

Examples:

```bash
exactcli asset list --search laptop --status 1
exactcli asset list --from 2026-01-01 --to 2026-12-31 --all
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
- `--force-login` - Show the Exact login form even when the browser has a session, to sign in as another user
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--account <value>` - Account GUID or code
- `--main <value>` - Main bank account only (true or false)
- `--search <value>` - Bank account number contains

Examples:

```bash
exactcli bank-account list --account 1001
exactcli bank-account list --main yes --all --output csv
```

## exactcli bank-entry

### `exactcli bank-entry create`

Book a bank statement by hand from ledger account codes (POST financialtransaction/BankEntries)

```
exactcli bank-entry create [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--journal <value>` _(required)_ - Code of the bank journal, for example 500
- `--line <value>` _(required)_ - Line as <gl account>:<amount>[:description] (repeatable, at least one). The account is a code or a GUID. The amount is signed from the point of view of the bank: money received is positive, money paid negative
- `--account <value>` - Customer or supplier code or GUID (crm/Accounts) carried by every line: a receipt from a customer or a payment to a supplier
- `--date <value>` - Date of every line (YYYY-MM-DD)
- `--description <value>` - Description of the lines that carry none
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli bank-entry create --journal 500 --line "400000:121:Invoice 26700001" --account 1001 --dry-run
exactcli bank-entry create --journal 500 --line 656000:-12.5:Fees --date 2026-09-03 --allow-writes
```

### `exactcli bank-entry lines`

List the lines of bank entries, by entry GUID or number (GET financialtransaction/BankEntryLines)

```
exactcli bank-entry lines <ref> [flags]
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
exactcli bank-entry lines <guid>
exactcli bank-entry lines <number> <number> --output json
```

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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--journal <value>` - Bank journal code
- `--year <value>` - Financial year
- `--period <value>` - Financial period

Examples:

```bash
exactcli bank-entry list --journal 55 --year 2026
exactcli bank-entry list --year 2026 --period 9 --all --output csv
```

## exactcli bank-statement

### `exactcli bank-statement upload`

Upload a bank statement file (CODA, MT940, CAMT) to the bank import (POST documents/Documents, POST cashflow/BankStatementUploadAttachments)

```
exactcli bank-statement upload [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--file <value>` _(required)_ - Bank statement file to upload
- `--subject <value>` - Document subject. Default: the file name
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli bank-statement upload --file statement.cod --dry-run
exactcli bank-statement upload --file statement.cod --subject "September 2026" --allow-writes
```

## exactcli budget

### `exactcli budget list`

List budgets (amounts per ledger account and period)

```
exactcli budget list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--year <value>` - Reporting year
- `--period <value>` - Reporting period
- `--gl-account <value>` - Ledger account code
- `--scenario <value>` - Budget scenario code

Examples:

```bash
exactcli budget list --year 2026 --gl-account 700000
exactcli budget list --year 2026 --period 3 --scenario BUDGET --all
```

## exactcli cash-entry

### `exactcli cash-entry lines`

List the lines of cash entries, by entry GUID or number (GET financialtransaction/CashEntryLines)

```
exactcli cash-entry lines <ref> [flags]
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
exactcli cash-entry lines <guid>
exactcli cash-entry lines <number> <number> --output json
```

### `exactcli cash-entry list`

List cash entries (cash book headers)

```
exactcli cash-entry list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--journal <value>` - Cash journal code
- `--year <value>` - Financial year
- `--period <value>` - Financial period

Examples:

```bash
exactcli cash-entry list --journal 57 --year 2026
exactcli cash-entry list --year 2026 --period 9 --all --output csv
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
exactcli config set read_only true
exactcli config set write_divisions 123456
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

### `exactcli contact create`

Create a contact, a person of an account (POST crm/Contacts)

```
exactcli contact create [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--account <value>` _(required)_ - Account code or GUID (crm/Accounts)
- `--first-name <value>` _(required)_ - First name
- `--last-name <value>` _(required)_ - Last name
- `--email <value>` - E-mail address
- `--phone <value>` - Business phone number
- `--mobile <value>` - Mobile phone number
- `--job-title <value>` - Job title (JobTitleDescription)
- `--main <value>` - Main contact of the account: true, false, yes, no, 1 or 0 (IsMainContact)
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli contact create --account 1001 --first-name Jane --last-name Doe --email jane@acme.example --dry-run
exactcli contact create --account 1001 --first-name Jane --last-name Doe --main true --allow-writes
```

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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--search <value>` - Full name contains, or exact Code
- `--account <value>` - Account GUID or code
- `--email <value>` - Exact email address
- `--since <value>` - Modified on or after (YYYY-MM-DD)

Examples:

```bash
exactcli contact list --search jane
exactcli contact list --account 1001 --output json
```

### `exactcli contact update`

Update the given fields of a contact (PUT crm/Contacts)

```
exactcli contact update <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--first-name <value>` - First name
- `--last-name <value>` - Last name
- `--email <value>` - E-mail address
- `--phone <value>` - Business phone number
- `--mobile <value>` - Mobile phone number
- `--job-title <value>` - Job title (JobTitleDescription)
- `--main <value>` - Main contact of the account: true, false, yes, no, 1 or 0 (IsMainContact)
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli contact update <id> --email jane@acme.example --dry-run
exactcli contact update <id> --job-title CFO --main true --allow-writes
```

## exactcli cost-center

### `exactcli cost-center list`

List cost centers (the departments that costs book to)

```
exactcli cost-center list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--search <value>` - Description contains, or exact Code
- `--active <value>` - Active cost centers only (true or false)

Examples:

```bash
exactcli cost-center list
exactcli cost-center list --search sales --active true
```

## exactcli cost-unit

### `exactcli cost-unit list`

List cost units (the projects or products that costs book to)

```
exactcli cost-unit list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--search <value>` - Description contains, or exact Code

Examples:

```bash
exactcli cost-unit list
exactcli cost-unit list --search project --all
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--search <value>` - Description contains
- `--since <value>` - Modified on or after (YYYY-MM-DD)

Examples:

```bash
exactcli currency list
exactcli currency list --search euro --output json
```

## exactcli custom-field

### `exactcli custom-field set`

Set the value of a custom field on one record (POST customfield/UpdateCustomField)

```
exactcli custom-field set <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing
- `--component <value>` _(required)_ - Business component, for example Account or Item
- `--record <value>` _(required)_ - Record (GUID) that carries the field
- `--value <value>` _(required)_ - Value to store
- `--caption <value>` - Description of the custom field
- `--type <value>` - Data type of the custom field
- `--refers-to <value>` - Referenced entity, for example Item or Account

Examples:

```bash
exactcli custom-field set Segment --component Account --record <account-id> --value North --dry-run
exactcli custom-field set Segment --component Account --record <account-id> --value North --allow-writes
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

Create a document and attach files (POST documents/Documents, POST documents/DocumentAttachments)

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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--search <value>` - Description contains, or exact Code
- `--parent <value>` - Parent element GUID
- `--namespace <value>` - Taxonomy namespace GUID (the reporting scheme)
- `--abstract <value>` - Group elements only (true or false)

Examples:

```bash
exactcli gl-classification list --search turnover
exactcli gl-classification list --parent <guid> --all
```

## exactcli goods-delivery

### `exactcli goods-delivery list`

List goods deliveries (the shipments of sales orders)

```
exactcli goods-delivery list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--account <value>` - Delivery account GUID or code (the account that receives)
- `--from <value>` - Delivery date from (YYYY-MM-DD)
- `--to <value>` - Delivery date to (YYYY-MM-DD)
- `--search <value>` - Description contains

Examples:

```bash
exactcli goods-delivery list --from 2026-01-01 --to 2026-01-31
exactcli goods-delivery list --account 1001 --search urgent --all
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
- `--line <value>` _(required)_ - Invoice line as item:quantity:unit price[:option=value...][:description] (repeatable). Options: vat (code), discount (a fraction: 0.1 is 10%), gl-account (revenue account code or GUID, instead of the one of the item), cost-center, cost-unit
- `--description <value>` - Invoice description
- `--credit-note` - Create a credit note (Type 8021). The lines carry negative quantities: Exact books the signs as given
- `--remarks <value>` - Remarks printed on the invoice
- `--reference <value>` - Reference of the customer (YourRef)
- `--payment-condition <value>` - Payment condition code (PaymentCondition)
- `--date <value>` - Invoice date (YYYY-MM-DD)
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli invoice create --customer 1001 --journal 700 --line Default:2:100 --dry-run
exactcli invoice create --customer 1001 --journal 700 --line Default:2:100 --allow-writes
```

## exactcli item

### `exactcli item create`

Create an item, a product or a service (POST logistics/Items)

```
exactcli item create [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--code <value>` _(required)_ - Item code
- `--description <value>` _(required)_ - Item description
- `--sales-price <value>` - Standard sales price (StandardSalesPrice)
- `--cost-price <value>` - Standard cost price (CostPriceStandard)
- `--unit <value>` - Unit code, for example pc
- `--sales <value>` - Sales item: true, false, yes, no, 1 or 0 (IsSalesItem)
- `--purchase <value>` - Purchase item: true, false, yes, no, 1 or 0 (IsPurchaseItem)
- `--stock <value>` - Stock item: true, false, yes, no, 1 or 0 (IsStockItem)
- `--gl-revenue <value>` - Revenue ledger account code or GUID (GLRevenue)
- `--gl-costs <value>` - Costs ledger account code or GUID (GLCosts)
- `--group <value>` - Item group code or GUID (ItemGroup)
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli item create --code WIDGET --description Widget --sales-price 99.5 --sales true --dry-run
exactcli item create --code WIDGET --description Widget --gl-revenue 700000 --allow-writes
```

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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--search <value>` - Description contains, or exact Code
- `--sales <value>` - Sales items only (true or false)
- `--purchase <value>` - Purchase items only (true or false)
- `--stock <value>` - Stock items only (true or false)

Examples:

```bash
exactcli item list --search widget
exactcli item list --sales yes --stock yes --all
```

### `exactcli item update`

Update the given fields of an item (PUT logistics/Items). The code is the key and stays as it is

```
exactcli item update <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--description <value>` - Item description
- `--sales-price <value>` - Standard sales price (StandardSalesPrice)
- `--cost-price <value>` - Standard cost price (CostPriceStandard)
- `--unit <value>` - Unit code, for example pc
- `--sales <value>` - Sales item: true, false, yes, no, 1 or 0 (IsSalesItem)
- `--purchase <value>` - Purchase item: true, false, yes, no, 1 or 0 (IsPurchaseItem)
- `--stock <value>` - Stock item: true, false, yes, no, 1 or 0 (IsStockItem)
- `--gl-revenue <value>` - Revenue ledger account code or GUID (GLRevenue)
- `--gl-costs <value>` - Costs ledger account code or GUID (GLCosts)
- `--group <value>` - Item group code or GUID (ItemGroup)
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli item update WIDGET --description "Widget XL" --sales-price 120 --dry-run
exactcli item update <id> --gl-revenue 700000 --stock false --allow-writes
```

## exactcli item-group

### `exactcli item-group list`

List item groups (the ledger accounts that items book to)

```
exactcli item-group list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--search <value>` - Description contains, or exact Code
- `--default <value>` - Default group flag: 1 default, 0 other

Examples:

```bash
exactcli item-group list
exactcli item-group list --search parts --default 1
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--search <value>` - Description contains, or exact Code
- `--type <value>` - Journal type: 10 cash, 12 bank, 16 payment service, 20 sales, 22 purchase, 90 general

Examples:

```bash
exactcli journal list
exactcli journal list --type 12 --search bank
```

## exactcli journal-entry

### `exactcli journal-entry create`

Post a general journal entry (OD) from ledger account codes (POST generaljournalentry/GeneralJournalEntries)

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

### `exactcli journal-entry lines`

List the lines of general journal entries, by entry GUID or number (GET generaljournalentry/GeneralJournalEntryLines)

```
exactcli journal-entry lines <ref> [flags]
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
exactcli journal-entry lines <guid>
exactcli journal-entry lines <number> <number> --output json
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--journal <value>` - Journal code
- `--year <value>` - Financial year
- `--period <value>` - Financial period
- `--status <value>` - Status code, for example 20 (open) or 50 (processed)

Examples:

```bash
exactcli journal-entry list --journal 800 --year 2026
exactcli journal-entry list --year 2026 --period 9 --status 20 --all
```

## exactcli mail-message

### `exactcli mail-message list`

List sent mail messages (digital postbox and scan service)

```
exactcli mail-message list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--operation <value>` - Scan service operation: 1 purchase invoice without details, 2 with details, 3 sales invoice, 4 bank statement
- `--status <value>` - Recipient status: 5 rejected, 10 draft, 20 open, 25 prepared, 30 approved, 40 realized, 42 in process, 43 at the scanning service, 45 error, 46 blocked, 50 processed
- `--from <value>` - Sent date from (YYYY-MM-DD)
- `--to <value>` - Sent date to (YYYY-MM-DD)

Examples:

```bash
exactcli mail-message list --from 2026-01-01
exactcli mail-message list --operation 2 --status 50
```

## exactcli mailbox

### `exactcli mailbox list`

List mailboxes (the addresses of the digital postbox)

```
exactcli mailbox list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--search <value>` - Description contains
- `--account <value>` - Account GUID or code (the owner of the mailbox)
- `--type <value>` - Mailbox type: 0 unknown, 1 Exact, 2 government, 3 manual input

Examples:

```bash
exactcli mailbox list --search postbox
exactcli mailbox list --account 1001 --type 1
```

### `exactcli mailbox upload`

Send files to the digital postbox or the scan service of the division (POST mailbox/MailMessagesSent, POST mailbox/MailMessageAttachments)

```
exactcli mailbox upload [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--file <value>` _(required)_ - File to send (repeatable)
- `--to <value>` - Recipient mailbox GUID. Default: the scan service mailbox of the division, else its default mailbox
- `--subject <value>` - Message subject. Default: the name of the first file
- `--operation <value>` - Scan service operation: 1 purchase invoice without details, 2 with details, 3 sales invoice, 4 bank statement
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli mailbox upload --file invoice.pdf --operation 2 --dry-run
exactcli mailbox upload --file invoice.pdf --file receipt.pdf --operation 1 --allow-writes
exactcli mailbox upload --file statement.xml --to <mailbox-id> --subject "Bank export" --allow-writes
```

## exactcli payables-list

### `exactcli payables-list list`

List open payable invoices per supplier (financial report)

```
exactcli payables-list list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--search <value>` - Account name contains (a code goes to --account)
- `--account <value>` - Account GUID or code
- `--due-from <value>` - Due date from (YYYY-MM-DD)
- `--due-to <value>` - Due date to (YYYY-MM-DD)

Examples:

```bash
exactcli payables-list list --due-from 2026-09-01 --due-to 2026-09-30
exactcli payables-list list --search acme --all --output csv
```

## exactcli payment

### `exactcli payment approve`

Approve a payment: set PaymentMethod B, electronic (PUT cashflow/Payments). The payment shows on the payments page again and can be processed

```
exactcli payment approve <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--method <B|I|K|V>` - PaymentMethod: B electronic (approved), I collection, K cash (held), V credit card
- `--dry-run` - Show the request and send nothing

Examples:

```bash
exactcli payment approve <payment-id> --dry-run
exactcli payment approve <payment-id> --allow-writes
exactcli payment approve <payment-id> --method K --allow-writes
```

### `exactcli payment hold`

Hold a payment: set PaymentMethod K, cash (PUT cashflow/Payments). The payment leaves the payments page until "payment approve" puts it back

```
exactcli payment hold <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the request and send nothing

Examples:

```bash
exactcli payment hold <payment-id> --dry-run
exactcli payment hold <payment-id> --allow-writes
```

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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--account <value>` - Supplier GUID or code
- `--entry <value>` - The purchase entry (GUID) that created the payment
- `--due-from <value>` - Due date from (YYYY-MM-DD)
- `--due-to <value>` - Due date to (YYYY-MM-DD)
- `--status <value>` - Status: 20 open, 30 selected, 40 processed, 50 matched
- `--search <value>` - Description contains

Examples:

```bash
exactcli payment list --status 20 --due-to 2026-09-30
exactcli payment list --account 2001 --all --output csv
exactcli payment list --entry <purchase-entry-id>
```

### `exactcli payment process`

Process approved payments (POST cashflow/ProcessPayments). The answer carries SuccessMessage, ErrorMessage and the BankExportDocumentsUrl of the files to send to the bank

```
exactcli payment process <payment> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli payment process <payment-id> --dry-run
exactcli payment process <payment-id> <payment-id> --allow-writes
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division

Examples:

```bash
exactcli profit-loss list
exactcli profit-loss list --output json
```

## exactcli project

### `exactcli project list`

List projects (time and cost projects with their account)

```
exactcli project list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--account <value>` - Account GUID or code (the customer of the project)
- `--search <value>` - Description contains, or exact Code
- `--type <value>` - Project type code
- `--from <value>` - Start date from (YYYY-MM-DD)
- `--to <value>` - Start date to (YYYY-MM-DD)

Examples:

```bash
exactcli project list --account 1001 --search website
exactcli project list --type 1 --from 2026-01-01 --all --output csv
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
- `--line <value>` _(required)_ - Line as <gl account>:<amount>[:option=value...][:description] (repeatable). The account is a code or a GUID; the amount is a decimal. Options: vat, vat-amount, from, to, quantity, cost-center, cost-unit, non-deductible, private-use. from and to (YYYY-MM-DD) spread the amount over a period
- `--credit-note` - Post a credit note (Type 31). The lines carry negative amounts: Exact books the signs as given
- `--description <value>` - Entry description
- `--date <value>` - Entry date (YYYY-MM-DD)
- `--invoice <value>` - Invoice number (InvoiceNumber)
- `--file <value>` - File to attach (repeatable). The files land on one new document of type 20, and the entry links that document
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli purchase-entry create --supplier 1001 --journal 600 --line 700000:100 --dry-run
exactcli purchase-entry create --supplier 1001 --journal 600 --line 700000:100 --allow-writes
exactcli purchase-entry create --supplier 1001 --journal 600 --line 700000:100 --file invoice.pdf --allow-writes
```

### `exactcli purchase-entry lines`

List the lines of purchase entries, by entry GUID or number (GET purchaseentry/PurchaseEntryLines)

```
exactcli purchase-entry lines <ref> [flags]
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
exactcli purchase-entry lines <guid>
exactcli purchase-entry lines <number> <number> --output json
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division

Examples:

```bash
exactcli purchase-entry list
exactcli purchase-entry list --filter "EntryDate ge datetime'2026-01-01'" --all
exactcli purchase-entry list --limit 200 --output json
```

## exactcli purchase-invoice

### `exactcli purchase-invoice create`

Create a purchase invoice from codes (POST purchase/PurchaseInvoices)

```
exactcli purchase-invoice create [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--supplier <value>` _(required)_ - Supplier code or GUID (crm/Accounts with IsSupplier)
- `--journal <value>` _(required)_ - Purchase journal code, for example 600
- `--type <value>` - Invoice type: 8030 direct purchase invoice, 8031 direct purchase invoice (credit), 8033 purchase invoice, 8034 purchase invoice (credit)
- `--line <value>` _(required)_ - Invoice line as item:quantity:unit price[:description] (repeatable)
- `--description <value>` - Invoice description
- `--date <value>` - Invoice date (YYYY-MM-DD). The financial year and period come from it, or from today without --date
- `--reference <value>` - Invoice number of the supplier (YourRef)
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli purchase-invoice create --supplier 2001 --journal 600 --line Default:2:100 --dry-run
exactcli purchase-invoice create --supplier 2001 --journal 600 --line Default:2:100 --reference INV-2026-42 --allow-writes
```

### `exactcli purchase-invoice lines`

List the lines of purchase invoices, by invoice GUID or entry number (GET purchase/PurchaseInvoiceLines)

```
exactcli purchase-invoice lines <ref> [flags]
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
exactcli purchase-invoice lines <guid>
exactcli purchase-invoice lines <number> <number> --output json
```

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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--supplier <value>` - Supplier GUID or code
- `--from <value>` - Invoice date from (YYYY-MM-DD)
- `--to <value>` - Invoice date to (YYYY-MM-DD)
- `--status <value>` - Status code: 10 draft, 20 open, 50 processed

Examples:

```bash
exactcli purchase-invoice list --from 2026-01-01 --to 2026-01-31
exactcli purchase-invoice list --supplier 2001 --status 20 --output json
```

## exactcli purchase-order

### `exactcli purchase-order create`

Create a purchase order from codes (POST purchaseorder/PurchaseOrders)

```
exactcli purchase-order create [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--supplier <value>` _(required)_ - Supplier code or GUID (crm/Accounts with IsSupplier)
- `--line <value>` _(required)_ - Order line as item:quantity:unit price[:description] (repeatable)
- `--description <value>` - Order description
- `--date <value>` - Order date (YYYY-MM-DD)
- `--receipt-date <value>` - Expected receipt date (YYYY-MM-DD)
- `--reference <value>` - Reference of the supplier (YourRef)
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli purchase-order create --supplier 2001 --line Default:2:100 --dry-run
exactcli purchase-order create --supplier 2001 --line Default:2:100 --receipt-date 2026-09-10 --allow-writes
```

### `exactcli purchase-order lines`

List the lines of purchase orders, by order GUID or number (GET purchaseorder/PurchaseOrderLines)

```
exactcli purchase-order lines <ref> [flags]
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
exactcli purchase-order lines <guid>
exactcli purchase-order lines <number> <number> --output json
```

### `exactcli purchase-order list`

List purchase orders (the orders placed with suppliers)

```
exactcli purchase-order list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--supplier <value>` - Supplier GUID or code (the account that delivers)
- `--from <value>` - Order date from (YYYY-MM-DD)
- `--to <value>` - Order date to (YYYY-MM-DD)
- `--status <value>` - Order status: 10 open, 20 partial, 30 complete, 40 cancelled
- `--search <value>` - Description contains

Examples:

```bash
exactcli purchase-order list --from 2026-01-01 --to 2026-01-31
exactcli purchase-order list --supplier 2001 --status 10 --all
```

## exactcli quotation

### `exactcli quotation accept`

Accept a quotation, with an optional follow-up (POST crm/AcceptQuotation)

```
exactcli quotation accept <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing
- `--action <value>` - Follow-up: 0 none, 1 sales order, 2 sales invoice, 3 project, 4 project WBS, 5 subscription
- `--invoice-journal <value>` - Journal code of the sales invoice (action 2)
- `--your-ref <value>` - Purchase order number of the customer
- `--reason <value>` - Reason code (GUID) of the acceptance
- `--opportunity-stage <value>` - Stage (GUID) of the linked opportunity afterwards
- `--notification-layout <value>` - Email layout (GUID) of the notification

Examples:

```bash
exactcli quotation accept <id> --dry-run
exactcli quotation accept <id> --action 1 --allow-writes
exactcli quotation accept <id> --action 2 --invoice-journal 70 --allow-writes
```

### `exactcli quotation create`

Create a quotation from codes (POST crm/Quotations)

```
exactcli quotation create [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--account <value>` _(required)_ - Account code or GUID that asked for the quotation (OrderAccount)
- `--line <value>` _(required)_ - Quotation line as item:quantity:unit price[:description] (repeatable)
- `--description <value>` - Quotation description
- `--date <value>` - Quotation date (YYYY-MM-DD)
- `--close-date <value>` - Date on which the customer accepted or rejected the quotation (YYYY-MM-DD)
- `--reference <value>` - Reference of the customer (YourRef)
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli quotation create --account 1001 --line Default:2:100 --dry-run
exactcli quotation create --account 1001 --line Default:2:100 --close-date 2026-09-30 --allow-writes
```

### `exactcli quotation email`

Email a quotation that the customer signs off online (POST crm/EmailWithSignOffQuotation)

```
exactcli quotation email <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing
- `--email-layout <value>` _(required)_ - Email layout (GUID) of the message text
- `--layout <value>` - Document layout (GUID) of the PDF
- `--subject <value>` - Subject of the email
- `--extra-text <value>` - Extra text on the document and in the email
- `--action <value>` - Follow-up: 0 none, 1 sales order, 2 sales invoice, 3 project, 4 project WBS, 5 subscription
- `--invoice-journal <value>` - Journal code of the sales invoice (action 2)
- `--your-ref <value>` - Purchase order number of the customer
- `--allow-your-ref` - Let the customer enter a purchase order number
- `--accept-layout <value>` - Email layout (GUID) sent on acceptance
- `--reject-layout <value>` - Email layout (GUID) sent on rejection
- `--date <value>` - Date printed on the quotation (YYYY-MM-DD)

Examples:

```bash
exactcli quotation email <id> --email-layout <layout-id> --dry-run
exactcli quotation email <id> --email-layout <layout-id> --action 1 --allow-writes
```

### `exactcli quotation lines`

List the lines of quotations, by quotation GUID or number; a number matches every version (GET crm/QuotationLines)

```
exactcli quotation lines <ref> [flags]
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
exactcli quotation lines <guid>
exactcli quotation lines <number> <number> --output json
```

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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
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

### `exactcli quotation print`

Print a quotation to a PDF document, and email it (POST crm/PrintQuotation)

```
exactcli quotation print <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing
- `--layout <value>` - Document layout (GUID) of the PDF
- `--email-layout <value>` - Email layout (GUID) of the message text
- `--extra-text <value>` - Extra text on the document and in the email
- `--email` - Send the document to the customer by email
- `--date <value>` - Date printed on the quotation (YYYY-MM-DD)

Examples:

```bash
exactcli quotation print <id> --dry-run
exactcli quotation print <id> --email --allow-writes
```

### `exactcli quotation reject`

Reject a quotation (POST crm/RejectQuotation)

```
exactcli quotation reject <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing
- `--reason <value>` - Reason code (GUID) of the rejection
- `--opportunity-stage <value>` - Stage (GUID) of the linked opportunity afterwards
- `--notification-layout <value>` - Email layout (GUID) of the notification

Examples:

```bash
exactcli quotation reject <id> --dry-run
exactcli quotation reject <id> --allow-writes
```

### `exactcli quotation reopen`

Reopen an accepted or rejected quotation (POST crm/ReopenQuotation)

```
exactcli quotation reopen <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli quotation reopen <id> --dry-run
exactcli quotation reopen <id> --allow-writes
```

### `exactcli quotation review`

Review a quotation: a new version replaces it (POST crm/ReviewQuotation)

```
exactcli quotation review <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing
- `--description <value>` - Description of the new quotation
- `--date <value>` - Date of the new quotation (YYYY-MM-DD)
- `--copy-prices` - Copy the item prices of the original
- `--account <value>` - Order account (code or GUID) of the new quotation
- `--payment-condition <value>` - Payment condition code
- `--document <value>` - Document (GUID) linked to the new quotation

Examples:

```bash
exactcli quotation review <id> --dry-run
exactcli quotation review <id> --allow-writes
```

### `exactcli quotation update`

Update the header fields of a quotation (PUT crm/Quotations). Lines stay as they are

```
exactcli quotation update <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--description <value>` - Quotation description
- `--date <value>` - Quotation date (YYYY-MM-DD)
- `--close-date <value>` - Date on which the customer accepted or rejected the quotation (YYYY-MM-DD)
- `--reference <value>` - Reference of the customer (YourRef)
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli quotation update <id> --close-date 2026-09-30 --dry-run
exactcli quotation update <id> --description "Spring offer" --reference PO-42 --allow-writes
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
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

## exactcli receivables-list

### `exactcli receivables-list list`

List open receivable invoices per customer (financial report)

```
exactcli receivables-list list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--search <value>` - Account name contains (a code goes to --account)
- `--account <value>` - Account GUID or code
- `--due-from <value>` - Due date from (YYYY-MM-DD)
- `--due-to <value>` - Due date to (YYYY-MM-DD)

Examples:

```bash
exactcli receivables-list list --due-to 2026-09-30
exactcli receivables-list list --account 1001 --output json
```

## exactcli return

### `exactcli return process`

Set the status of a return request (VAT or payroll declaration) (POST financial/ProcessReturn)

```
exactcli return process <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing
- `--status <value>` _(required)_ - New status: 5 rejected, 50 processed

Examples:

```bash
exactcli return process <request-id> --status 50 --dry-run
exactcli return process <request-id> --status 50 --allow-writes
```

## exactcli revenue

### `exactcli revenue list`

List the revenue per reporting year and period

```
exactcli revenue list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--year <value>` - Reporting year
- `--period <value>` - Reporting period

Examples:

```bash
exactcli revenue list --year 2026
exactcli revenue list --year 2026 --period 3 --output json
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
- `--line <value>` _(required)_ - Line as <gl account>:<amount>[:option=value...][:description] (repeatable). The account is a code or a GUID; the amount is a decimal. Options: vat, vat-amount, from, to, quantity, cost-center, cost-unit. from and to (YYYY-MM-DD) spread the amount over a period
- `--credit-note` - Post a credit note (Type 21). The lines carry negative amounts: Exact books the signs as given
- `--description <value>` - Entry description
- `--date <value>` - Entry date (YYYY-MM-DD)
- `--invoice <value>` - Invoice reference (YourRef)
- `--file <value>` - File to attach (repeatable). The files land on one new document of type 10, and the entry links that document
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli sales-entry create --customer 1001 --journal 700 --line 700000:100 --dry-run
exactcli sales-entry create --customer 1001 --journal 700 --line 700000:100 --allow-writes
exactcli sales-entry create --customer 1001 --journal 700 --line 700000:100 --file invoice.pdf --allow-writes
```

### `exactcli sales-entry lines`

List the lines of sales entries, by entry GUID or number (GET salesentry/SalesEntryLines)

```
exactcli sales-entry lines <ref> [flags]
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
exactcli sales-entry lines <guid>
exactcli sales-entry lines <number> <number> --output json
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division

Examples:

```bash
exactcli sales-entry list
exactcli sales-entry list --filter "EntryDate ge datetime'2026-01-01'" --all
exactcli sales-entry list --limit 200 --output json
```

## exactcli sales-invoice

### `exactcli sales-invoice lines`

List the lines of sales invoices, by invoice GUID or number (GET salesinvoice/SalesInvoiceLines)

```
exactcli sales-invoice lines <ref> [flags]
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
exactcli sales-invoice lines <guid>
exactcli sales-invoice lines <number> <number> --output json
```

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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--customer <value>` - Customer GUID or code (the account that ordered)
- `--from <value>` - Invoice date from (YYYY-MM-DD)
- `--to <value>` - Invoice date to (YYYY-MM-DD)
- `--status <value>` - Status code: 20 open (a draft in the web interface, not printed yet), 50 processed (printed), 10 draft (rare)
- `--search <value>` - Description contains

Examples:

```bash
exactcli sales-invoice list --from 2026-01-01 --to 2026-01-31
exactcli sales-invoice list --customer 1001 --status 20 --all
```

### `exactcli sales-invoice print`

Print a sales invoice to a PDF document, and send it by email, postbox or Peppol (POST salesinvoice/PrintedSalesInvoices)

```
exactcli sales-invoice print <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing
- `--layout <value>` - Document layout (GUID) of the PDF
- `--email-layout <value>` - Email layout (GUID) of the message text
- `--extra-text <value>` - Extra text on the document and in the email
- `--email` - Send the document to the customer by email
- `--sender <value>` - Email address of the sender
- `--postbox` - Send the invoice to the postbox of the customer
- `--postbox-sender <value>` - Postbox (GUID) that sends the message
- `--peppol` - Send the invoice through Peppol
- `--by-account` - Take the output preference of the account
- `--date <value>` - Invoice date (YYYY-MM-DD)
- `--reporting-year <value>` - Reporting year
- `--reporting-period <value>` - Reporting period

Examples:

```bash
exactcli sales-invoice print <id> --dry-run
exactcli sales-invoice print <id> --email --allow-writes
exactcli sales-invoice print <id> --peppol --allow-writes
```

## exactcli sales-order

### `exactcli sales-order complete`

Complete a sales order: close what is not delivered or invoiced (POST salesorder/CompleteSalesOrder)

```
exactcli sales-order complete <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing
- `--delivery` - Complete the remaining goods delivery
- `--invoice` - Complete the outstanding invoice amount

Examples:

```bash
exactcli sales-order complete <id> --dry-run
exactcli sales-order complete <id> --delivery --invoice --allow-writes
```

### `exactcli sales-order complete-line`

Complete one sales order line (POST salesorder/CompleteSalesOrderLine)

```
exactcli sales-order complete-line <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing
- `--delivery` - Complete the remaining goods delivery
- `--invoice` - Complete the outstanding invoice amount

Examples:

```bash
exactcli sales-order complete-line <id> --dry-run
exactcli sales-order complete-line <id> --allow-writes
```

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

### `exactcli sales-order invoice`

Invoice sales orders (POST salesinvoice/InvoiceSalesOrders)

```
exactcli sales-order invoice <order> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--journal <value>` _(required)_ - Code of the sales journal, for example 700
- `--create-mode <value>` - CreateMode: 0 one invoice per customer, 1 one invoice per sales order
- `--invoice-mode <value>` - InvoiceMode: 0 invoice the quantity delivered (default), 1 the quantity ordered
- `--invoice-date <value>` - Invoice date (YYYY-MM-DD, UserInvoiceDate). Exact applies it only in the QuickBooks integration
- `--async` - Mode 1: Exact queues the run and answers a ProcessID for InvoiceSalesOrdersResult. Exact keeps only this mode after October 2026; without the flag the run is synchronous (Mode 0)
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli sales-order invoice <order-id> --journal 700 --dry-run
exactcli sales-order invoice <order-id> <order-id> --journal 700 --create-mode 0 --allow-writes
exactcli sales-order invoice <order-id> --journal 700 --async --allow-writes
```

### `exactcli sales-order lines`

List the lines of sales orders, by order GUID or number (GET salesorder/SalesOrderLines)

```
exactcli sales-order lines <ref> [flags]
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
exactcli sales-order lines <guid>
exactcli sales-order lines <number> <number> --output json
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
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

### `exactcli sales-order print`

Print a sales order to a PDF document, and email it (POST salesorder/PrintedSalesOrders)

```
exactcli sales-order print <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing
- `--layout <value>` - Document layout (GUID) of the PDF
- `--email-layout <value>` - Email layout (GUID) of the message text
- `--extra-text <value>` - Extra text on the document and in the email
- `--email` - Send the document to the customer by email
- `--sender <value>` - Email address of the sender

Examples:

```bash
exactcli sales-order print <id> --dry-run
exactcli sales-order print <id> --allow-writes
```

## exactcli stock-count

### `exactcli stock-count process`

Process a stock count (POST inventory/ProcessStockCount)

```
exactcli stock-count process <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli stock-count process <id> --dry-run
exactcli stock-count process <id> --allow-writes
```

## exactcli subscription

### `exactcli subscription list`

List subscriptions (recurring invoice contracts)

```
exactcli subscription list [flags]
```

- `--filter <value>` - OData $filter expression
- `--select <value>` - Comma-separated properties for $select
- `--expand <value>` - OData $expand expression
- `--orderby <value>` - OData $orderby expression
- `--top <value>` - Page size ($top), max 60
- `--all` - Follow every page, up to --max-pages
- `--max-pages <value>` - Maximum number of pages to read
- `--raw` - Print the raw API envelope
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--account <value>` - Account GUID or code (the account that is invoiced)
- `--from <value>` - Start date from (YYYY-MM-DD)
- `--to <value>` - Start date to (YYYY-MM-DD)
- `--search <value>` - Description contains

Examples:

```bash
exactcli subscription list --account 1001
exactcli subscription list --from 2026-01-01 --search hosting --all
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--search <value>` - Description contains, or exact Code
- `--type <value>` - Calculation type: B (base only), E (excluding), I (including), N (no VAT)
- `--blocked <value>` - Blocked codes only (true or false)

Examples:

```bash
exactcli vat-code list
exactcli vat-code list --type E --blocked no
```

## exactcli warehouse-transfer

### `exactcli warehouse-transfer process`

Process a warehouse transfer (POST inventory/ProcessWarehouseTransfer)

```
exactcli warehouse-transfer process <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--dry-run` - Show the validated request and send nothing
- `--date <value>` - Transfer date (YYYY-MM-DD)

Examples:

```bash
exactcli warehouse-transfer process <id> --dry-run
exactcli warehouse-transfer process <id> --allow-writes
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
- `--count` - Print the number of matching records ($count), not the records
- `--all-divisions` - Read every division the user can access, one after the other; every row carries its Division (replaces --division). --limit and --all apply per division
- `--topic <value>` - Subscription topic, for example Accounts or Items
- `--search <value>` - Description contains
- `--instant <value>` - Instant delivery subscriptions only (true or false)

Examples:

```bash
exactcli webhook list --topic Accounts
exactcli webhook list --search acme --output json
```

### `exactcli webhook update`

Update the callback URL or the description of a webhook subscription (PUT webhooks/WebhookSubscriptions)

```
exactcli webhook update <id> [flags]
```

- `--allow-writes` - Allow this command to write (POST, PUT, DELETE). Env: EXACTCLI_ALLOW_WRITES=1
- `--yes` - Confirm a DELETE
- `--url <value>` - Callback URL (https only)
- `--description <value>` - Description of the subscription
- `--dry-run` - Show the validated request and send nothing

Examples:

```bash
exactcli webhook update <id> --url https://acme.example/hooks/exact-v2 --dry-run
exactcli webhook update <id> --description "Production hook" --allow-writes
```

