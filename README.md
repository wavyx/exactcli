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
3. Register an app with the printed redirect URI. Copy the Client ID and the Client
   Secret. The route depends on your subscription:
   - A customer subscription registers an internal app in Exact Online: Company name >
     Import/Export > App registrations. It needs the Manage apps role and serves only
     the users of that subscription.
   - A developer subscription has no such menu. Register the app in the App Store:
     Manage my apps. A test app serves only the users of the developer subscription.
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
exactcli transaction-line list --year 2025 --count  # one call, OData $count
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

| Topic                                                                            | Commands                                                                                                                                                    |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auth                                                                             | `login`, `logout`, `status`                                                                                                                                 |
| profile                                                                          | `list`, `use`, `current`                                                                                                                                    |
| config                                                                           | `get`, `set`, `list`, `unset`                                                                                                                               |
| division                                                                         | `list` (`--scope`), `use`, `current`                                                                                                                        |
| account, contact, item                                                           | `list`, `create`, `update`                                                                                                                                  |
| gl-classification, address, bank-account, item-group, currency, exchange-rate    | `list`                                                                                                                                                      |
| gl-account, journal, vat-code, payment-condition, cost-center, cost-unit         | `list`, `create`, `update`, `delete` (`payment-condition`: `list`, `create`)                                                                                |
| financial-period, balance, budget, revenue, profit-loss                          | `list`                                                                                                                                                      |
| aging-receivable, aging-payable, aging-overview, receivables-list, payables-list | `list`                                                                                                                                                      |
| sales-entry, purchase-entry                                                      | `list`, `lines`, `create` (with `--file`), `update`, `delete`, `line-add`, `line-update`, `line-delete`                                                     |
| journal-entry                                                                    | `list`, `lines`, `create`, `delete`                                                                                                                         |
| bank-entry                                                                       | `list`, `lines`, `create`, `delete`, `line-add`                                                                                                             |
| cash-entry                                                                       | `list`, `lines`, `create`, `delete`, `line-add`                                                                                                             |
| transaction-line, opening-balance                                                | `list`                                                                                                                                                      |
| mandate                                                                          | `list`, `create`, `update`, `delete`                                                                                                                        |
| sales-invoice                                                                    | `list`, `lines`, `update`, `delete`, `print`, `line-add`, `line-update`, `line-delete`                                                                      |
| invoice                                                                          | `create`                                                                                                                                                    |
| purchase-invoice, purchase-order                                                 | `list`, `lines`, `create`, `update`, `delete` (`purchase-order` adds `line-add`, `line-update`, `line-delete`)                                              |
| quotation                                                                        | `list`, `lines`, `create`, `update`, `delete`, `accept`, `reject`, `reopen`, `review`, `print`, `email`, `line-add`, `line-update`, `line-delete`           |
| sales-order                                                                      | `list`, `lines`, `create`, `update`, `delete`, `invoice`, `invoice-result`, `complete`, `complete-line`, `print`, `line-add`, `line-update`, `line-delete`  |
| payment                                                                          | `list`, `approve`, `hold`, `process`                                                                                                                        |
| goods-delivery, receivable, project, asset, subscription                         | `list` (`receivable` adds `update`, `collect`)                                                                                                              |
| document                                                                         | `list`, `download`, `create`                                                                                                                                |
| document-type                                                                    | `list`                                                                                                                                                      |
| mailbox                                                                          | `list`, `upload`                                                                                                                                            |
| mail-message                                                                     | `list`                                                                                                                                                      |
| bank-statement                                                                   | `upload`                                                                                                                                                    |
| webhook                                                                          | `list`, `create`, `update`, `delete`, `listen`                                                                                                              |
| alias                                                                            | `set`, `list`, `unset`                                                                                                                                      |
| sync                                                                             | `sync <resource>`, `timestamp`                                                                                                                              |
| (root)                                                                           | `me`, `list`, `get`, `create`, `update`, `delete`, `lookup`, `upsert`, `deleted`, `backup`, `api`, `probe`, `metadata`, `quota`, `mcp`, `doctor`, `version` |

Full reference with every flag: [docs/commands.md](docs/commands.md) or
`exactcli <command> --help`. End-to-end flows (login, entries, invoices, documents,
synchronisation, reporting, agents): [docs/recipes.md](docs/recipes.md). Which API calls
have a typed command, and which writes were verified live:
[docs/coverage.md](docs/coverage.md).

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
exactcli payment list --entry <purchase-entry-id>
exactcli mailbox list --search postbox
exactcli mail-message list --operation 2 --status 50
```

`--account`, `--customer` and `--supplier` take a GUID or a code; a code is looked up on
`crm/Accounts`. A free `--filter` combines with the typed filters. Every list takes
`--count` (one `$count` call) and `--all-divisions` (one read per division the user can
access; each row carries its `Division`, a code resolves in the division it reads, and a
division without the code or the module is skipped with a note on stderr). `--limit`
applies per division. The MCP tools do not take `--all-divisions`: the server owns the
division.

The lines of invoices, entries, orders and quotations, by GUID or by number. The same
headers take `delete` (all ten) and `update` (where Exact accepts a PUT), by GUID or
number; a number that names several headers, such as the versions of a quotation, must
be replaced by the GUID of one:

```sh
exactcli sales-invoice lines 26700001 26700002
exactcli purchase-entry lines 26600001 --output json
exactcli journal-entry lines <entry-id>
exactcli sales-order lines 12
exactcli sales-entry update 26700005 --set Description="Corrected" --allow-writes
exactcli purchase-invoice delete 26600001 26600002 --allow-writes --yes
```

`webhook listen` subscribes to topics through the ngrok domain of the profile (the
domain of the redirect URI), checks the HMAC-SHA256 signature of each notification with
the webhook secret of the app, prints each verified one as a JSON line, and removes its
subscriptions when it stops (Ctrl+C, also during the set-up, or `--max-events`; `--keep`
leaves them). That removal needs no `--yes`: it touches only the subscriptions of the
run. A signed body with a second `Content`, or a signed `Content` nested deeper, is
refused. The secret
comes from `EXACTCLI_WEBHOOK_SECRET` in the shell, never from a `.env` file, or from a
prompt:

```sh
exactcli webhook listen --topic Accounts --topic SalesInvoices --allow-writes
```

The lines of an existing entry: `line-add` on sales, purchase, bank and cash entries (by
entry GUID or number; the entry link comes from the argument only; Exact refuses a POST
of a general journal entry line, although its reference lists one), `line-update` and `line-delete`
by line GUID on sales and purchase entries, the two whose lines take a PUT and a
DELETE:

```sh
exactcli sales-entry line-add 26700002 --set GLAccount=@ref:financial/GLAccounts:700000 \
  --set AmountFC=100 --set VATCode=F --allow-writes
exactcli sales-entry line-update <line-id> --set Description="Fee" --allow-writes
exactcli purchase-entry line-delete <line-id> --allow-writes --yes
```

The lines of sales invoices, sales orders, purchase orders and quotations take the
same three commands. A PUT that changes only the quantity re-prices the line from the
item: send the price with it. Exact answers 403 to a POST of a purchase invoice line,
so `purchase-invoice` has no `line-add`.

```sh
exactcli sales-order line-add 12 --set Item=@ref:logistics/Items:WIDGET --set Quantity=2 \
  --set UnitPrice=100 --allow-writes
exactcli quotation line-update <line-id> --set Quantity=3 --set UnitPrice=100 --allow-writes
```

Master data by code: ledger accounts, journals, VAT codes, cost centers and cost units
take `create` (`--code`, `--description`, `--set`), `update` and `delete` by GUID or code;
payment conditions take `create` only, as Exact offers no PUT or DELETE there:

```sh
exactcli gl-account create --code 799000 --description "Other income" --set Type=110 --allow-writes
exactcli journal update 800 --set Description="General journal" --allow-writes
exactcli cost-center delete HQ --allow-writes --yes
exactcli payment-condition create --code 30D --description "30 days" --set PaymentDays=30 --allow-writes
```

`receivable collect` prepares receivables for a direct debit: payment method I, an
optional mandate, description and payment reference; it takes a receivable GUID or the
invoice number of one open receivable. `receivable update` sets any field by GUID:

```sh
exactcli receivable collect 26700002 --mandate <mandate-id> --allow-writes
exactcli receivable update <id> --set PaymentMethod=B --allow-writes
exactcli cash-entry create --journal 570 --line 604000:-20:"Office supplies" --allow-writes
```

Direct debit mandates (SEPA Core or B2B). `mandate create` finds the bank account of
the debtor by IBAN, or takes its GUID:

```sh
exactcli mandate list --account 1001
exactcli mandate create --account 1001 --iban BE68539007547034 --reference ACME-001 \
  --type b2b --signature-date 2026-10-01 --allow-writes
exactcli mandate update <id> --set CancellationDate=2026-10-14 --allow-writes
exactcli mandate delete <id> --allow-writes --yes
```

Opening balances, and the divisions of other scopes:

```sh
exactcli opening-balance list                          # current year, every entry
exactcli opening-balance list --year previous --processed
exactcli division list --scope accessible              # every license (accountants)
exactcli division list --scope all                     # also divisions without access
exactcli division list --scope recent                  # the five used last
```

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
exactcli sales-order invoice <order-id> --journal 700 --wait --allow-writes
exactcli purchase-entry create --supplier 2001 --journal 600 --line 611000:1250 --file invoice.pdf --allow-writes
exactcli purchase-entry create --supplier 2001 --journal 600 \
  --line 611000:1200:vat=5:from=2026-01-01:to=2026-12-31:"Annual licence" --allow-writes
exactcli purchase-entry create --supplier 2001 --journal 600 --line 611000:-150:vat=5 --credit-note --allow-writes
exactcli invoice create --customer 1001 --journal 700 \
  --line Default:1:1350:vat=F:"Service fee" --remarks "Reverse charge" --allow-writes
exactcli invoice create --customer 1001 --journal 700 --line Default:-1:1350:vat=F --credit-note --allow-writes
exactcli payment approve <payment-id> --allow-writes
exactcli payment hold <payment-id> --allow-writes
exactcli payment process <payment-id> <payment-id> --allow-writes
exactcli account update 1001 --name "Acme NV" --city Ghent --allow-writes
exactcli item update WIDGET --description "Widget XL" --sales-price 120 --allow-writes
exactcli contact update <id> --email jane@acme.example --allow-writes
exactcli webhook update <id> --url https://acme.example/hooks/exact-v2 --allow-writes
exactcli quotation update <id> --close-date 2026-09-30 --allow-writes
exactcli mailbox upload --file invoice.pdf --operation 2 --allow-writes
exactcli bank-statement upload --file statement.cod --allow-writes
```

A line takes named options between its fields and its description:
`<gl account>:<amount>[:option=value...][:description]` for entries,
`item:quantity:unit price[:option=value...][:description]` for invoices. Entry options:
`vat`, `vat-amount`, `from` and `to` (spread the amount over a period), `quantity`,
`cost-center`, `cost-unit`; purchase entries add `non-deductible` and `private-use`, as
fractions (0.5 is 50%). Invoice options: `vat`, `discount` (a fraction), `gl-account`,
`cost-center`, `cost-unit`. An unknown option, or a known one after the description,
fails with exit 64. A credit note
(`--credit-note`) needs a negative total: Exact books the signs as given.

Actions act on one record through the POST-only resources of Exact Online. Each one
takes the record GUID, the flags of the action, `--dry-run` and the write gate:

```sh
exactcli quotation accept <id> --action 1 --allow-writes        # 1 = create a sales order
exactcli quotation reject <id> --reason <reason-id> --allow-writes
exactcli quotation reopen <id> --allow-writes
exactcli quotation review <id> --description "v2" --copy-prices --allow-writes
exactcli quotation print <id> --email --allow-writes
exactcli quotation email <id> --email-layout <layout-id> --allow-writes
exactcli sales-order complete <id> --delivery --invoice --allow-writes
exactcli sales-order complete-line <line-id> --invoice --allow-writes
exactcli sales-order print <id> --email --allow-writes
exactcli sales-invoice print <id> --peppol --allow-writes
exactcli stock-count process <id> --allow-writes
exactcli warehouse-transfer process <id> --date 2026-09-10 --allow-writes
exactcli assembly-order finish <id> --quantity 10 --allow-writes
exactcli return process <request-id> --status 50 --allow-writes
exactcli custom-field set Segment --component Account --record <account-id> --value North --allow-writes
```

The answer of an action carries `SuccessMessage` or `ErrorMessage`, and the id of what
it created (`Document`, `NewQuotationID`). The remaining fields of an action (project
and subscription follow-ups of `quotation accept`, for example) go through
`create crm/AcceptQuotation --set ...`, which validates them against the catalogue.

`--file` on `sales-entry create` and `purchase-entry create` creates a document (type 10
or 20), attaches the files and links the document to the entry, as the Exact
documentation prescribes. `payment approve` and `payment hold` follow the "Approve
payments" flow: the payment method B shows a purchase entry on the payments page, K
hides it; `payment process` sends the selected payments to the bank export.
`mailbox upload` sends files to the scan service of the division; `bank-statement
upload` feeds the bank import.

`sales-order invoice` queues the run (Mode 1, the only mode Exact keeps after
October 2026) and prints the `ProcessID`. `--wait` reads
`InvoiceSalesOrderResult` every `--interval` seconds until the run ends, prints the
result, and exits 65 on an error status or a failed invoice; past `--wait-timeout` it
exits 75 and names the `sales-order invoice-result <process-id>` command.

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

`lookup` finds records by exact field values; `upsert` creates the record that
`--match` finds nothing for, or updates the one it finds (the match fields stay out of
the update). Several matches fail with exit 65. A numeric `Code` also matches the
padded form Exact stores:

```sh
exactcli lookup crm/Accounts --match Code=1001 --one --jq .ID
exactcli upsert crm/Accounts --match Code=1001 --set Name="Acme NV" --allow-writes
```

`--set Key=value` is repeatable and merges over `--body`. Values: text, numbers,
`true`, `false`, `null`; `@str:1001` pins a string; `@guid:<id>` pins a GUID;
`@ref:crm/Accounts:1001` resolves a code to the GUID of that record.

Two profile settings protect an administration that must stay untouched:

```sh
exactcli config set read_only true --profile prod           # no write at all
exactcli config set write_divisions 123456 --profile test   # writes reach 123456 only
```

`read_only` refuses every write of the profile. `write_divisions` takes a list of
division codes separated by commas. A write to another division, or to a path without
a division, stops with exit 77 before the request leaves. The check covers the typed
commands, the generic ones, `api` and the MCP tools. `config set` stores both settings in the profile and in the keychain credential.
`auth login` keeps the stricter of the two carriers, so an empty or edited config
directory cannot loosen them. A token from `EXACTCLI_ACCESS_TOKEN` skips the keychain:
only the config settings apply to it. `auth status` shows both settings.
`config unset write_divisions` removes the list.

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

`backup` copies a division to a directory: one JSON file per sync feed, merged by
`ID`, and a `manifest.json` with the timestamps. The next run reads only the changes,
then removes the records of the deleted log. A feed of a module the division lacks
answers 403 and is marked `forbidden`; a feed cut by `--max-pages` is `partial` and
goes on at the next run; any other failure marks the feed `failed` and the run exits
65 at the end. Exact keeps deletions for two months: after a longer pause, the run
warns, and `--full` reads everything again.

```sh
exactcli backup --list                                  # the feed names
exactcli backup --dir ./backup-acme                     # every feed
exactcli backup --dir ./backup-acme --feed Financial/TransactionLines --feed CRM/Accounts
```

## Aliases

An alias is a short name for a longer command. It runs with the words typed after it.
An alias that stores `--allow-writes` or `--yes` writes or deletes without them on the
command line: `alias set` warns about such an alias. The profile settings `read_only`
and `write_divisions` still apply:

```sh
exactcli alias set unpaid "receivable list --all"
exactcli alias set acme -- account list --filter "Name eq 'Acme NV'"
exactcli unpaid --output csv
exactcli alias list
exactcli alias unset unpaid
```

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
sequentially. It repeats a GET or a PUT after a network failure or a 5xx, never a POST
or a DELETE: such a write may have landed, so the command exits 69 and says so. Check
before you send it again.

## For agents

- Self-describing: `exactcli --help`, `exactcli <command> --help`,
  `exactcli metadata <resource>`.
- Machine output: `--output json`, `--jq '.[] | .Name'`, `--fields`.
- Deterministic exit codes; a 77 means "run `exactcli auth login`" or "add
  `--allow-writes`".
- `exactcli doctor --output json` checks the setup before a run,
  `exactcli quota --output json` the budget.

### MCP server

`exactcli mcp` runs a Model Context Protocol server over stdio. It exposes seven
generic tools that cover every resource of the catalogue (`exact_resources`,
`exact_metadata`, `exact_list`, `exact_get`, `exact_probe`, `exact_me`, `exact_quota`) plus one
tool per typed command (`exact_transaction_line_list`, `exact_account_list`, ...).
The server is read-only unless it starts with `--allow-writes`, which adds
`exact_write` (create, update, delete with `dry_run` and `confirm`). Each tool call
runs `exactcli` as a child process under the profile and the division of the
server. Two resources carry the docs an agent should read first:
`exactcli://docs/recipes` (the verified flows and the rules learned live) and
`exactcli://docs/coverage` (which calls have a typed command, which writes were verified
live).

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
- A profile can refuse every write (`read_only`) or limit writes to a list of
  divisions (`write_divisions`). Both settings live in the keychain credential too.
- `--verbose` never prints credentials.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities as described in
[SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
