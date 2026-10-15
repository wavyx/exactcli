# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- exactcli needs Node.js 22 or newer. Node.js 20 reached its end of life on
  2026-04-30, and oclif 5, chalk 6 and vitest 5 require Node.js 22.

## [0.14.4] - 2026-10-15

### Added

- `warehouse-transfer process` and `stock-count process` take the transfer
  or count number as well as the GUID. A number that matches nothing exits 65.
- `list --param name=value` passes function parameters as is, for example
  `--param "linkId='<guid>'" --param "bcName='Account'"` for
  `customfield/CustomFields`.

### Changed

- 19 more write calls are verified live on a test administration: time and
  cost entries, subscriptions, shop orders, stock count, warehouse transfer
  and assembly order finish (152 in all).
- `list --fields` sends the names as `$select` when all of them are
  properties of the resource.
- The `return process` help names the `Request` field of
  `read/financial/Returns`. Exact creates a request only when an accountant
  sends the return for approval.

### Fixed

- `list financialtransaction/TransactionLines --fields ...` no longer gets
  400 "Please add a $select".
- The `line-add` example uses the national VAT code `5` instead of the
  intra-EU code `F`.

## [0.14.3] - 2026-10-14

### Changed

- 27 more write calls are verified live on a test administration: document updates (contact, quotation, purchase and sales invoices,
  purchase entry, purchase and sales orders, goods receipts and deliveries,
  webhook URL), sales order print, complete and line completion, goods
  receipt and delivery creation, cash entry and sales order deletes, CRM
  notes, events and tasks, the mailbox upload, and the quotation review,
  reopen, reject and accept actions, and payment processing (133 in all).
- Known limit: `quotation print` gets 500 "Non autorise - Modification:
  Statut" from Exact through the API, also on a quotation created in the
  web interface, which prints it fine. Print the quotation there; the other
  quotation actions then work through the CLI.
- Known limit: `bank-statement upload` creates the document, then Exact
  answers a generic 500 on `BankStatementUploadAttachments` in a live test.
  The same CODA file imports fine in the web interface, so the limit is on
  the API side: import the file there.
- The webhook `--description` help says that Exact may keep its own value:
  Exact ignored it on POST and PUT in a live test.

### Fixed

- Release: the Homebrew job waits until npm serves a fresh version (up to
  20 tries, 30 s apart) instead of failing on the first 404.

## [0.14.2] - 2026-10-14

### Changed

- `webhook listen` names the app of a refused notification (`Content.ClientId`):
  Exact signs with the webhook secret of that app, so a secret of another app
  shows at once. The prompt and the docs say which secret to use.
- `webhook create`, `webhook delete` and `webhook listen` are verified live.

## [0.14.1] - 2026-10-14

### Added

- The documentation site in `website/` (Astro and Starlight): the home page,
  guides, automation pages and the command reference, which
  `npm run docs:commands` now writes too. The docs workflow deploys it to
  GitHub Pages.
- `scripts/gen-dist.mjs` and a release job that push the Homebrew formula to
  `wavyx/homebrew-tap` when the `TAP_TOKEN` secret is set.
- Issue and pull request templates, dependabot and a code of conduct.

### Fixed

- CI on Windows: the repository keeps LF line ends, and the login test
  accepts the Windows wrap prefix of oclif warnings.
- Coverage on Node 20: the typed command factories decide their examples
  and flags outside the class field initializers.
- `npm run test:coverage` builds the oclif manifest first, so a missing or
  stale manifest no longer lowers the coverage.

## [0.14.0] - 2026-10-14

### Added

- `create`, `update` and `delete` on opportunities, addresses, bank
  accounts, supplier item links, sales prices, exchange rates, projects,
  warehouses, sales channels, depreciation methods, document folders,
  subscriptions, project time and cost entries; `delete` on accounts,
  contacts and items; `update` and `delete` on documents; `create` on tasks,
  events and communication notes; `create` and `update` on goods receipts
  and goods deliveries. A record with a code of its own takes the code
  wherever it takes a GUID (a contact takes GUIDs only: its Code is the one
  of its account). One table (`src/lib/typed/records.js`) declares them.
- Verified live: opportunities, addresses, bank accounts, supplier item
  links, sales prices, exchange rates, projects, warehouses, sales channels,
  depreciation methods, documents, and the deletes of accounts, contacts and
  items. Not verified: document folders (403 on the test licence), time and
  cost entries and subscriptions (they need an employee or a time item), the
  activities and goods receipts and deliveries (Exact offers no DELETE to
  undo a test).

## [0.13.0] - 2026-10-14

### Added

- `gl-account`, `journal`, `vat-code`, `cost-center` and `cost-unit` take
  `create` (`--code`, `--description`, `--set`), `update` and `delete` by GUID
  or code; `payment-condition create` (no PUT or DELETE in Exact). Verified
  live.
- `cash-entry create`, built like `bank-entry create` (verified live).
- `receivable collect <ref...>`: payment method I, optional mandate,
  description and payment reference, by receivable GUID or invoice number;
  `receivable update` by GUID (verified live).
- `line-add`, `line-update`, `line-delete` on sales invoices, sales orders,
  purchase orders and quotations (verified live). A sales invoice line may
  leave out the ledger account: Exact takes the one of the item (verified
  live).

### Removed

- `journal-entry line-add`: Exact answers 500 "This method is currently not
  supported" to a POST of a general journal entry line (verified live).

## [0.12.1] - 2026-10-14

### Fixed

- The client never sends a POST or a DELETE again after a network failure or
  a 5xx: the write may have landed, and a second POST could book twice. It
  exits 69 and the message says that the write may have landed. GET and PUT still repeat; a 429 and a 401 repeat for
  every method, since Exact did nothing then.
- The minute rate-limit wait and the 429 backoff read
  `X-RateLimit-Minutely-Reset`, not the daily reset: a spent minute no longer
  costs the full 65 seconds.
- `--limit` caps a walk with `--all` too; it was ignored.
- `purchase-invoice create --type` takes 8030, 8031, 8033 or 8034 only: any
  other code skipped the credit sign check.
- `webhook listen --ngrok-domain` strips an `http://` or `https://` scheme in
  any case and every trailing slash.
- `backup` documents the live shape of the deleted log: it keys each
  deleted record by the ID of its sync row (verified for sales invoices,
  sales orders and entries), so the feeds drop deleted rows by their ID.
- The MCP tools accept a number for an option flag such as a type code.

## [0.12.0] - 2026-10-14

### Added

- `<topic> delete <ref...>` for the ten headers of `lines` and `<topic> update
<ref>` where Exact accepts a PUT (sales invoices, sales and purchase entries,
  sales and purchase orders, purchase invoices), by GUID or number. A number
  that names several headers fails with 65; a failed delete names the headers
  already deleted.
- `webhook listen --topic ...`: a loopback receiver behind the ngrok domain of
  the profile, subscriptions on start, HMAC-SHA256 check of every notification
  with the webhook secret of the app, one JSON line per verified notification,
  unsubscribe on exit. An empty secret is refused. `EXACTCLI_WEBHOOK_SECRET` is shell only; the MCP server
  does not expose the command.
- `sales-order invoice-result <process-id>` reads a queued invoicing run
  (`read/salesinvoice/InvoiceSalesOrderResult`); `sales-order invoice --wait`
  polls it until the run ends (exit 65 on an error status or a failed invoice,
  75 past `--wait-timeout`). The status comes as text (verified live).
- `mandate list|create|update|delete` for direct debit mandates; `create`
  finds the bank account of the debtor by IBAN (verified live).
- `<entry> line-add` on sales, purchase, general journal, bank and cash
  entries, and `line-update`, `line-delete` on sales and purchase entry lines
  (verified live on sales entries).
- `opening-balance list` (`--year current|previous`, `--processed`) and
  `division list --scope license|accessible|all|recent`.
- `lookup <resource> --match Field=value` and `upsert <resource> --match ...
--set ...`: create or update by business key, exit 65 on several matches;
  a numeric Code matches its padded form (verified live).
- `backup --dir`: one JSON file per sync feed, incremental runs from the
  stored timestamps, deletions from `sync/Deleted`, `forbidden`, `partial`
  and `failed` feeds in the manifest, `--full`, `--list`.
- `alias set|list|unset`: an unknown command runs the alias of that name with
  the words typed after it; cycles and chains past 10 stop with 64.
- The catalogue follows the reference of 2026-10-14: `sync/CRM/BankAccounts`
  and new fields on items, documents and purchase entry lines.
- `purchase-invoice create` lines take options: `vat`, `vat-amount`,
  `discount`, `from`/`to`, `cost-center`, `cost-unit`. A credit type (8031, 8034) needs a negative total: Exact refuses a positive one (verified live).

### Changed

- `sales-order invoice` always queues the run (Mode 1): Exact switched the
  synchronous mode off in October 2026. The `--async` flag is gone.

### Fixed

- `invoice create` and `purchase-invoice create` refuse a negative `discount`
  (a fraction from 0 to 1): a negative value turned the discount into a markup.
- `payment process` fails with 65 when Exact answers 201 with an ErrorMessage,
  after it prints the answer: Exact processes nothing then (the ErrorMessage
  answer was seen live; a successful export is not verified yet).

## [0.11.1] - 2026-09-25

### Fixed

- `purchase-invoice create` sends the financial year and period of the invoice
  date (today without `--date`), looked up in `financial/FinancialPeriods`:
  Exact refuses a purchase invoice without them and does not derive them from
  the date (verified live). A date that no period covers fails with 65.

## [0.11.0] - 2026-09-25

### Added

- `<topic> lines <ref...>` for sales invoices, sales, purchase, general journal,
  bank and cash entries, sales and purchase orders, quotations and purchase
  invoices: the lines of one or more headers, each named by its GUID or its
  number (one lookup for the numbers, one read for the lines).
- `--all-divisions` on `list` and every typed list: one read per division the
  user can access, one after the other; every row carries its `Division`, and a
  code resolves in the division it reads. With `--count`, one count per division.
  A division without the code or the module (403) is skipped with a note on
  stderr; `--limit` and `--all` apply per division. CLI only: the MCP tools keep
  the division of the server.
- Named line options (`option=value` between the fields and the description).
  Entries: `vat`, `vat-amount`, `from`/`to` (deferral period, both or none),
  `quantity`, `cost-center`, `cost-unit`; purchase entries add `non-deductible`
  and `private-use` as fractions. Invoices: `vat`, `discount` (a fraction up to
  1), `gl-account`, `cost-center`, `cost-unit`. An unknown option, or a known one
  after the description or in upper case, fails with exit 64.
- `--credit-note` on `sales-entry create`, `purchase-entry create` and
  `invoice create`. It needs a negative total: Exact books the signs as given
  and derives the type of an entry from the sign (verified live).
- `invoice create --remarks --reference --payment-condition`. A credit note
  counts the discount of each line in its total.
- `<topic> lines` accepts a number of ten digits at most (an Int32).
- The MCP server serves `exactcli://docs/recipes` and `exactcli://docs/coverage`
  as resources; the package ships both files.

### Changed

- The `--line` help of the entry and invoice commands shows the options.
- `sales-invoice list --status` says that 20 (Open) is a draft of the web
  interface. `auth login` names both registration routes.

### Fixed

- `sales-entry create` and `purchase-entry create` with `--file` no longer leave
  an orphan document when Exact refuses the entry or an attachment: the command
  deletes the new document, or names it when the delete fails too. Without an
  answer from Exact (timeout, broken connection) the entry may exist, so the
  command keeps the document and names it.

## [0.10.0] - 2026-09-25

### Added

- `config set write_divisions <codes>`: a profile writes only to the listed
  divisions. The HTTP client checks the division in the path of every POST, PUT
  and DELETE (typed and generic commands, `api`, MCP tools) and refuses any other
  division, or a path without one, with exit 77 before the request leaves. The
  list lives in the keychain credential too (`config set`, `auth login`, kept on
  every refresh); with a list in both carriers only the common divisions remain.
  `config unset write_divisions` clears both. `auth status` shows the list.
  A value that is not a list of division codes refuses every write.
- Every write path with an encoded slash, backslash, dot or percent is refused
  with exit 64: a decoding server could resolve another division than the one
  the check reads.

- `docs/coverage.md`, generated by `npm run docs:coverage`: every catalogued
  call per family and method, which calls have a typed command, and which write
  calls were verified live (`scripts/live-writes.json`). Every typed write
  command now names its calls in its description.
- Recipe 7 verified live: sales order, invoice from the order, print. The print
  moves the invoice to Processed; its sales entry stays Open in the ledger.

### Fixed

- `auth login` no longer drops the read-only lock or widens the write list of
  the credential it replaces when the config directory lacks them or holds a
  wider list. The login keeps the stricter of the two carriers.

## [0.9.0] - 2026-09-25

### Added

- `--count` on `list` and on every typed list command: prints the number of
  matching records in one call (OData `$count`), with `--filter` and the typed
  filters applied. `--bulk` counts through the regular resource. The MCP list
  tools (`exact_list` and the typed ones) take `count` too.

### Fixed

- A `$count` path answered 415 `Unsupported media type requested`: the client
  accepted only JSON. It now sends `Accept: text/plain, application/json` on a
  `$count` path, so the number arrives as text and an error still as JSON.
- README: the app registration step names both routes. A customer subscription
  registers an internal app in Exact Online; a developer subscription has no
  such menu and registers in the App Store.

## [0.8.1] - 2026-09-07

### Added

- `auth login --force-login`: asks Exact for the login form even when the
  browser holds a session, so that another user (a production account next to
  a developer account) can sign in. Without it Exact authorises the user of the
  open browser session, which also breaks the refresh chain of that user's
  other profile.

## [0.8.0] - 2026-09-07

### Added

- Actions: 15 commands on the POST-only resources, from one factory
  (`src/lib/typed/action.js`) and one descriptor file: `quotation accept|reject|
reopen|review|print|email`, `sales-order complete|complete-line|print`,
  `sales-invoice print`, `stock-count process`, `warehouse-transfer process`,
  `assembly-order finish`, `return process`, `custom-field set`. Each takes the
  record GUID, typed flags (int, number, date, GUID, code lookup), `--dry-run`
  and the write gate; the descriptors are checked against the catalogue.
  Every POST-only resource of the catalogue now has a typed command, except
  the two navigation sub-entities.

## [0.7.1] - 2026-09-07

Adversarial review of 0.7.0 (five lenses, two skeptics per finding): 7 confirmed
findings and 15 smaller ones, all fixed here. No live behaviour was reported
by a user.

### Fixed

- MCP: `exact_write` put the resource before the flags, so a resource such as
  `--division=999999` reached the child as a flag and escaped the division the
  server pinned. The positionals now follow a `--` separator and the resource is
  pattern-checked.
- MCP: with `--all-tools --allow-writes` the per-command write tools never
  passed `--allow-writes` (every call exited 77) and forced `--yes` on every
  tool. The server now passes `--allow-writes` to write tools and `--yes` only
  to a destructive tool called with `confirm: true`.
- MCP: the agent surface no longer carries the flags that read or write local
  files (`file`, `state`, `body`, `out`); the upload commands that need a file
  are not exposed. A success answer now carries the stderr notes (truncation,
  next sync timestamp) as a second text block. `key` accepts an integer.
- The `read_only` lock is stored in the keychain credential as well as in the
  config store, so an `EXACTCLI_CONFIG_DIR` that points elsewhere cannot unlock
  a profile whose token is still in use. `auth status` shows the lock.
- A resource path with percent-encoded dot segments (`%2e%2e/456/...`) could
  read another division; the resource check now refuses `%` and a decoded
  `..`, and the client refuses a path that URL normalisation changes.
- `--top` returned no rows: Exact answers a bare `{"d":[...]}` with `$top`,
  and the page walker read only `d.results`.
- A forced refresh after a 401 no longer rejects the profile when a sibling
  process rotated the token in the meantime; `doctor` refreshes an old token
  before its API probe instead of reporting a false failure.
- `sync` and `bulk` variants fall back to another service only under
  `Financial` (the accounting feeds); `crm/BankAccounts` no longer maps to the
  payroll feed. A full `/api/v1/<division>/...` path is no longer prefixed
  twice.
- A string key is quoted: `get general/Currencies EUR` sends
  `Currencies('EUR')`. A `to` date filter includes the whole last day. A guid
  filter without lookup refuses a value that is not a GUID.
- `--expand` on a list adds the navigation names to the default `$select`, so
  the expanded rows are returned.
- The OAuth callback checks the state before the `error` parameter; the token
  request times out after 30 s (below the stale-lock threshold); `auth logout`
  takes the refresh lock; `auth login` stores the host only after it succeeds;
  `sync timestamp --endpoint` is validated.
- `bin/dev.js` no longer loads `EXACTCLI_ALLOW_WRITES` or `EXACTCLI_CONFIG_DIR`
  from a `.env` file. Docs: seven generic MCP tools (with `exact_probe`), the
  `bank-entry create` example is quoted.

## [0.7.0] - 2026-09-07

Catalogue date: 2026-09-07 (435 resources, plus the hand-written extras file).

### Added

- Payments: `payment approve`, `payment hold`, `payment process`, and the `--entry`
  filter of `payment list` (the "Approve payments" flow of the documentation).
- `sales-entry create --file` and `purchase-entry create --file`: an entry with an
  attached document.
- `sales-order invoice --async`.
- Digital postbox: `mailbox list`, `mailbox upload` (scan service),
  `mail-message list`, `bank-statement upload`.
- Typed updates: `account update`, `item update`, `contact update`, `webhook update`,
  `quotation update`.
- `src/data/catalog-extras.json`: hand-written records for resources the reference
  does not list (`financialtransaction/Transactions`).
- A hint on the 400 that refuses OData functions in `$filter`.

### Changed

- Line, number and date parsing of the typed writes share `src/lib/lines.js`.
- Catalogue refreshed from the reference of 2026-09-07.

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

[0.7.0]: https://github.com/wavyx/exactcli/releases/tag/v0.7.0
[0.6.0]: https://github.com/wavyx/exactcli/releases/tag/v0.6.0
[0.5.0]: https://github.com/wavyx/exactcli/releases/tag/v0.5.0
[0.4.0]: https://github.com/wavyx/exactcli/releases/tag/v0.4.0
[0.3.0]: https://github.com/wavyx/exactcli/releases/tag/v0.3.0
[0.2.0]: https://github.com/wavyx/exactcli/releases/tag/v0.2.0
[0.1.0]: https://github.com/wavyx/exactcli/releases/tag/v0.1.0
