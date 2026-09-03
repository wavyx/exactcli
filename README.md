# exactcli

[![npm](https://img.shields.io/npm/v/@wavyx/exactcli)](https://www.npmjs.com/package/@wavyx/exactcli)
[![CI](https://github.com/wavyx/exactcli/actions/workflows/ci.yml/badge.svg)](https://github.com/wavyx/exactcli/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@wavyx/exactcli)](LICENSE)

Command-line interface for the [Exact Online](https://www.exact.com/) REST API.

`exactcli` gives you raw, host-locked access to every Exact Online resource with OData
filters and paging, plus typed commands for the accounting ledgers. JSON output,
deterministic exit codes and a `--jq` filter make it a clean way to drive Exact Online
from scripts, CI pipelines and AI agents.

Not affiliated with Exact. Exact Online is a trademark of Exact Group B.V.

## Install

```sh
npm install -g @wavyx/exactcli
exactcli --help
```

Node.js 20 or newer. Tokens go to the OS keychain (macOS Keychain, Windows Credential
Manager, libsecret on Linux); `exactcli` refuses to write them to disk.

`--jq` needs the jq binary. `npm install -g @wavyx/exactcli` may skip the download of
node-jq, so install jq (`brew install jq`, `apt install jq`,
`winget install jqlang.jq`) and set `JQ_PATH=/path/to/jq`, or run
`npm rebuild node-jq` inside a project install. Every other command works without jq.

## Authenticate

Exact Online supports the OAuth 2.0 authorization code flow only, and it requires a
public HTTPS redirect URI (localhost is rejected). `exactcli` runs a local callback
server and exposes it through an [ngrok](https://ngrok.com/) static domain.

1. Claim a static domain in your ngrok account and install `ngrok`.
2. Run `exactcli auth login`. The command prints the redirect URI,
   `https://<your-domain>/callback`.
3. In Exact Online, register an app: Company name > Import/Export > App registrations.
   Use the printed redirect URI. Copy the Client ID and the Client Secret.
4. Run `exactcli auth login` again, paste the Client ID and the Client Secret, and sign
   in in the browser that opens. The command stores the tokens in the keychain and
   remembers your division.

No ngrok? Use `exactcli auth login --manual`: open the printed URL yourself and paste
the redirected URL (or the code) back into the terminal.

Tokens refresh automatically. A refresh token that stays unused for 30 days expires:
run any command at least once a month, or log in again.

```sh
exactcli auth status         # token age, division, identity
exactcli auth logout
```

## Quick start

```sh
exactcli me                                      # who am I, which division
exactcli division list                           # administrations you can reach
exactcli list crm/Accounts --top 5 --select Name
exactcli list financial/GLAccounts --all --output json
exactcli get crm/Accounts <guid> --expand BankAccounts
exactcli sales-entry list --filter "EntryDate ge datetime'2026-01-01'" --all
exactcli purchase-entry list --limit 50 --output csv
exactcli api GET /api/v1/current/Me
exactcli api GET crm/Accounts --query '$top=1'
exactcli api POST crm/Accounts --body @account.json
```

Any resource from the
[REST API reference](https://start.exactonline.be/docs/HlpRestAPIResources.aspx) works
with `list`, `get` and `api`: pass the `service/Resource` path, for example
`salesentry/SalesEntries`, `financial/GLAccounts`, `documents/Documents`.

## Commands

| Topic                                                                                       | Commands                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| auth                                                                                        | `login`, `logout`, `status`                                                                                                   |
| profile                                                                                     | `list`, `use`, `current`                                                                                                      |
| config                                                                                      | `get`, `set`, `list`, `unset`                                                                                                 |
| division                                                                                    | `list`, `use`, `current`                                                                                                      |
| account, contact, item                                                                      | `list`, `create`                                                                                                              |
| address, bank-account, item-group, currency, exchange-rate                                  | `list`                                                                                                                        |
| gl-account, gl-classification, journal, vat-code, payment-condition, cost-center, cost-unit | `list`                                                                                                                        |
| financial-period, balance, budget, revenue, profit-loss                                     | `list`                                                                                                                        |
| aging-receivable, aging-payable, aging-overview, receivables-list, payables-list            | `list`                                                                                                                        |
| sales-entry, purchase-entry, journal-entry, bank-entry                                      | `list`, `create`                                                                                                              |
| transaction-line, cash-entry                                                                | `list`                                                                                                                        |
| sales-invoice                                                                               | `list`                                                                                                                        |
| invoice                                                                                     | `create`                                                                                                                      |
| purchase-invoice, quotation, purchase-order                                                 | `list`, `create`                                                                                                              |
| sales-order                                                                                 | `list`, `create`, `invoice`                                                                                                   |
| goods-delivery, receivable, payment, project, asset, subscription                           | `list`                                                                                                                        |
| document                                                                                    | `list`, `download`, `create`                                                                                                  |
| document-type                                                                               | `list`                                                                                                                        |
| webhook                                                                                     | `list`, `create`, `delete`                                                                                                    |
| sync                                                                                        | `sync <resource>`, `timestamp`                                                                                                |
| (root)                                                                                      | `me`, `list`, `get`, `create`, `update`, `delete`, `deleted`, `api`, `probe`, `metadata`, `quota`, `mcp`, `doctor`, `version` |

Full reference with every flag: [docs/commands.md](docs/commands.md) or
`exactcli <command> --help`. End-to-end flows (login, entries, invoices, documents,
synchronisation, reporting, agents): [docs/recipes.md](docs/recipes.md).

Global flags on every command: `--output table|json|yaml|csv`, `--jq <expr>`,
`--fields a,b`, `--profile <name>`, `--division <code>`, `--limit <n>`,
`--no-color`, `--verbose`, `--no-retry`, `--timeout <ms>`. Table output in a
terminal, JSON when piped.

## Catalogue and metadata

The CLI ships a catalogue of the 435 REST resources of Exact Online: path, methods,
fields, mandatory fields, filterable fields. It comes from the reference
documentation and is refreshed with `npm run catalog:build`; the date of the
catalogue is in the CHANGELOG.

```sh
exactcli metadata --search invoice          # which resources match a word
exactcli metadata salesentry/SalesEntries   # fields, types, mandatory, filterable
exactcli metadata crm/Accounts --methods    # summary: methods, keys, webhook
```

`list` and `get` read the catalogue too: a known resource gets readable default
columns (and a lighter `$select`), and the key type of `get` follows the
resource. A path that is not in the catalogue still goes out, with a warning.
`probe <resource>` fetches a few records and compares the fields the server
returns with the catalogue: undocumented fields first, then the documented ones,
then the catalogue fields the server did not return.

## Typed commands

Typed commands add readable columns and filters that know the accounting fields.
Every one of them is a small descriptor in `src/lib/typed/descriptors/`; adding one is
a matter of minutes. Reads:

```sh
exactcli account list --search acme --customer yes
exactcli contact list --account 1001 --since 2026-01-01
exactcli item list --search widget --sales yes
exactcli gl-account list --type 12
exactcli journal list --type 20
exactcli vat-code list --type E --blocked no
exactcli payment-condition list --method B --days 30
exactcli transaction-line list --year 2026 --period 9 --gl-account 700000
exactcli transaction-line list --journal 800 --from 2026-01-01 --to 2026-01-31
exactcli sales-entry list --limit 200 --output json
exactcli journal-entry list --journal 800 --year 2026
exactcli bank-entry list --journal 500 --year 2026
exactcli sales-invoice list --customer 1001 --from 2026-01-01 --status 20
exactcli purchase-invoice list --supplier 2001 --from 2026-01-01
exactcli receivable list --status 20 --due-to 2026-09-30
exactcli document list --from 2026-01-01 --type 10
exactcli document-type list --creatable yes
exactcli document download <document-id> --out ./attachments
exactcli balance list --year 2026 --period 9 --type W
exactcli profit-loss list
exactcli aging-receivable list --search acme
exactcli financial-period list --year 2026
exactcli sales-order list --customer 1001 --from 2026-01-01
exactcli quotation list --account 1001
exactcli payment list --status 20 --due-to 2026-09-30
exactcli bank-account list --account 1001 --main yes
exactcli address list --city Brussels
exactcli webhook list --topic Accounts
exactcli currency list --search euro
exactcli exchange-rate list --source USD --from 2026-01-01
exactcli receivables-list list --due-to 2026-09-30
exactcli payables-list list --search acme --all --output csv
exactcli revenue list --year 2026
exactcli aging-overview list --currency EUR
exactcli purchase-order list --supplier 2001 --from 2026-01-01 --status 10
exactcli goods-delivery list --account 1001 --from 2026-01-01
exactcli item-group list --search parts
exactcli cost-center list --active true
exactcli project list --account 1001 --from 2026-01-01
exactcli budget list --year 2026 --gl-account 700000
exactcli asset list --search laptop
exactcli subscription list --account 1001
exactcli cash-entry list --journal 570 --year 2026
```

`--account`, `--customer` and `--supplier` take a GUID or a code; a code is looked up on
`crm/Accounts`. A free `--filter` combines with the typed filters.

Typed writes build the nested bodies of Exact from codes (all behind `--allow-writes`):

```sh
exactcli invoice create --customer 1001 --journal 700 --line Default:2:100 --dry-run
exactcli invoice create --customer 1001 --journal 700 --line Default:2:100 --allow-writes
exactcli journal-entry create --journal 800 --line 499000:50:Rent --line 580600:-50 --allow-writes
exactcli document create --subject "Contract 2026" --type 183 --account 1001 --file contract.pdf --allow-writes
exactcli account create --name Acme --code 1001 --customer true --status C --country BE --allow-writes
exactcli sales-entry create --customer 1001 --journal 700 --line 700000:100:Consulting --allow-writes
exactcli purchase-entry create --supplier 2001 --journal 600 --line 611000:1250:Rent --allow-writes
exactcli sales-order create --customer 1001 --line Default:2:100 --delivery-date 2026-09-10 --allow-writes
exactcli webhook create --topic Accounts --url https://acme.example/hooks/exact --allow-writes
exactcli item create --code WIDGET --description Widget --sales-price 99.5 --sales true --gl-revenue 700000 --allow-writes
exactcli contact create --account 1001 --first-name Jane --last-name Doe --email jane@acme.example --allow-writes
exactcli quotation create --account 1001 --line Default:2:100 --close-date 2026-09-30 --allow-writes
exactcli purchase-invoice create --supplier 2001 --journal 600 --line Default:2:100 --reference INV-2026-42 --allow-writes
exactcli purchase-order create --supplier 2001 --line Default:2:100 --receipt-date 2026-09-10 --allow-writes
exactcli bank-entry create --journal 500 --line 400000:121:"Invoice 26700001" --account 1001 --allow-writes
exactcli sales-order invoice <order-id> --journal 700 --allow-writes
```

`invoice create` needs a customer (`IsSales` true) and an item per line. `journal-entry
create` checks that the lines balance before it sends anything; the amounts go to
`AmountFC`. `document create` reads the files first and posts one attachment per file.

## Writes

Writes are off by default. `create`, `update`, `delete` and `api POST|PUT|DELETE` need
`--allow-writes` (or `EXACTCLI_ALLOW_WRITES=1` in the shell), and a delete needs
`--yes` as well. Without the flag nothing is read and nothing is sent, exit 77.
`doctor` shows the state of the switch.

The generic write commands validate the body against the catalogue before they send
it: method allowed, mandatory fields present, no unknown field, no read-only field
on an update. `--dry-run` prints the validated request and sends nothing; it needs
no flag, so an agent can preview a write.

```sh
exactcli create crm/Accounts --set Name=Acme --set Code=1001 --dry-run
exactcli create crm/Accounts --set Name=Acme --set Code=1001 --allow-writes
exactcli create salesentry/SalesEntries --body @entry.json \
  --set Customer=@ref:crm/Accounts:1001 --allow-writes
exactcli update crm/Accounts <id> --set Name="Acme NV" --allow-writes
exactcli delete crm/Accounts <id> --allow-writes --yes
exactcli api DELETE "crm/Accounts(guid'<id>')" --allow-writes --yes   # raw, no validation
```

`--set Key=value` is repeatable and merges over `--body`. Values: text, numbers,
`true`, `false`, `null`; `@str:1001` pins a string; `@guid:<id>` pins a GUID;
`@ref:crm/Accounts:1001` resolves a code to the GUID of that record.

## Sync and bulk

Exact offers three read APIs per resource. The regular API pages at 60. The bulk
API (`list --bulk`) pages at 1000 and needs a `$select` (the catalogue columns by
default). The sync API returns only the records changed after a timestamp, 1000 per
page, and pairs with the deleted feed:

```sh
exactcli list crm/Accounts --bulk --all --output csv
exactcli sync crm/Accounts --since 0                     # full first load
exactcli sync crm/Accounts --state ./sync.json           # then only the changes
exactcli deleted --state ./sync.json                     # and the deletions
exactcli sync timestamp --endpoint Accounts --modified 2026-01-01   # start from a date
```

`--state` remembers the last timestamp per resource and is written only after a
complete walk. The next timestamp also prints on stderr. `sync timestamp` turns a
date into the timestamp to pass as `--since` for one feed (`Accounts`,
`TransactionLines`, ...; the list is in `metadata read/sync/Sync/SyncTimestamp`).

## Profiles and divisions

A profile holds the host (`start.exactonline.be` by default), the ngrok domain and the
default division. Several administrations, several accounts: one profile each.

```sh
exactcli profile use acme
exactcli auth login --profile acme
exactcli division use 123456                    # checks the access, then stores it
exactcli division current
exactcli list crm/Accounts --division 654321   # one-off override
```

Environment: `EXACTCLI_PROFILE`, `EXACTCLI_DIVISION`, `EXACTCLI_CLIENT_ID`,
`EXACTCLI_CLIENT_SECRET`, `EXACTCLI_CONFIG_DIR`, `EXACTCLI_ACCESS_TOKEN` (use a token
you obtained elsewhere; skips the keychain).

`exactcli` does not read `.env` files; export the variables in your shell.

## Output and exit codes

Dates arrive from Exact as `/Date(ms)/` in CET wall-clock time. `list`, `get` and the
typed commands print them as `2026-01-31T14:05:00`; `--raw` keeps the API envelope
untouched. `api` always prints the raw envelope.

Exit codes follow sysexits: 0 ok, 64 usage, 65 data (400/422), 69 service unavailable
(5xx, network, missing jq), 70 internal, 75 rate limit, 77 authentication (401/403, not
logged in), 78 configuration (keychain, host, missing division). In JSON mode errors
go to stderr as `{ "error", "message", "exitCode" }`.

Rate limits: Exact allows 60 calls per minute and 5000 per day per administration.
`exactcli` waits for the minute window, never retries a client error, and calls the API
sequentially.

## For agents

- Self-describing: `exactcli --help`, `exactcli <command> --help`,
  `exactcli metadata <resource>`.
- Machine output: `--output json`, `--jq '.[] | .Name'`, `--fields`.
- Deterministic exit codes; a 77 means "run `exactcli auth login`" or "add
  `--allow-writes`".
- `exactcli doctor --output json` checks the setup before a run,
  `exactcli quota --output json` the budget.

### MCP server

`exactcli mcp` runs a Model Context Protocol server over stdio. It exposes six
generic tools that cover every resource of the catalogue (`exact_resources`,
`exact_metadata`, `exact_list`, `exact_get`, `exact_me`, `exact_quota`) plus one
tool per typed command (`exact_transaction_line_list`, `exact_account_list`, ...).
The server is read-only unless it starts with `--allow-writes`, which adds
`exact_write` (create, update, delete with `dry_run` and `confirm`). Each tool call
runs `exactcli` as a child process under the profile and the division of the
server.

```sh
claude mcp add exact -- exactcli mcp
claude mcp add exact -- exactcli mcp --division 123456
```

Or in `.mcp.json` or `claude_desktop_config.json`:

```json
{ "mcpServers": { "exact": { "command": "exactcli", "args": ["mcp"] } } }
```

## Security

- Client secret, access token and refresh token live only in the OS keychain.
- Every request is locked to your Exact Online host; redirects are refused.
- The raw `api` command cannot leave that host.
- Writes are off unless you add `--allow-writes`; a delete needs `--yes` as well.
  `create`, `update` and `delete` validate the body against the catalogue first.
- `--verbose` never prints credentials.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities as described in
[SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
