---
title: Recipes
description: End-to-end recipes for the accounting flows of Exact Online, expressed with exactcli commands.
---

# Recipes

This page walks through the accounting flows of Exact Online with `exactcli`
commands. Each recipe is a short sequence of commands that you can copy. Replace the
placeholders in angle brackets, for example `<customer code>`, with your own values.
The examples use the customer "Acme" and the Belgian chart of accounts (sales journal
700, revenue account 700000, general journal 800).

Every recipe, or a step inside it, starts with one of two labels:

- Verified live: the flow ran on 2026-09-03 against a real Belgian administration.
  The facts come from the live notes of the project.
- From the documentation: the flow comes from the Exact Online documentation. Nobody
  ran it with `exactcli` yet. Expect small differences.

The write gate: a command that writes (POST, PUT, DELETE) sends nothing without
`--allow-writes` and exits 77. Add `--dry-run` to see the validated request without a
call. A DELETE also needs `--yes`. For a whole session, set `EXACTCLI_ALLOW_WRITES=1`.
Every flag on this page comes from `exactcli <command> --help`; the full list is in
[commands.md](commands.md).

## 1. First login and division

Verified live.

Exact Online offers only the OAuth 2.0 authorization code flow. The redirect URI must be
a public HTTPS URL; Exact refuses localhost. `exactcli` runs a local callback and
exposes it through an ngrok static domain. The steps: run the login once to see the
redirect URI, register an app in Exact Online with that URI, then run the login again
and paste the Client ID and the Client Secret at the prompt.

```sh
exactcli doctor --offline
exactcli auth login --ngrok-domain <domain>.ngrok-free.app
exactcli auth login --manual
```

Log in with the account of the developer licence. A demo app refuses every other user
with `error=unauthorized_client` on the callback. Then check the session:

```sh
exactcli me
exactcli auth status
exactcli quota
```

From the documentation: pick the administration. The division code goes to the
profile; `--division <code>` or `EXACTCLI_DIVISION` overrides it per call.

```sh
exactcli division list
exactcli division use <division code>
exactcli division current
```

Two rules for the token chain. Tokens refresh on their own after 575 seconds; a
refresh token that stays unused for 30 days expires. Never start a second `auth login`,
or open the authorize URL, for the same app and user while a session holds a refresh
token: a new authorization starts a new chain and the old refresh token dies with
`Token is not allowed, because of invalid or empty chainId`.

## 2. Explore a resource (metadata, list, get, probe)

Verified live.

`metadata` is offline: it reads the scraped catalogue of the API. Use it to find a
resource, its methods, its mandatory fields, and the properties that `$filter` accepts.

```sh
exactcli metadata --search invoice
exactcli metadata salesentry/SalesEntries --methods
exactcli metadata crm/Accounts --mandatory
exactcli metadata crm/Accounts --filterable
```

`list` and `get` work on every resource of the catalogue. They send the catalogue
columns as `$select`, unwrap the envelope, and print dates as ISO.

```sh
exactcli list crm/Accounts --select Code,Name --top 5
exactcli list crm/Accounts --filter "Status eq 'C'" --all --output json
exactcli list crm/Accounts --bulk --all --output csv
exactcli get crm/Accounts <guid> --select Code,Name,IsSales
exactcli get system/Divisions <division code>
```

Probe an endpoint with the raw command. It is host-locked and prints the envelope
untouched.

```sh
exactcli api GET /api/v1/current/Me
exactcli api GET crm/Accounts --query '$top=1'
exactcli api GET financial/ReportingBalance --query '$top=1'
exactcli list crm/Accounts --filter "Nope eq 1" --verbose
```

What to expect. `$top` changes the envelope: `{"d":[...]}` instead of
`{"d":{"results":[...]}}`. An unknown resource answers 404 with
`Resource not found for the segment`. A wrong property in `--filter` answers 400
with the property name.
`--verbose` prints the request and the `x-exact-correlation-id` of an error, which
support asks for. The sync feeds and `financial/ReportingBalance` refuse a plain GET:
they need `$select` or `$top=1`.

## 3. Create a customer and read it back

Verified live. The typed `account create` step is From the documentation.

A sales entry or a sales invoice needs a customer: an account with `IsSales=true`.
Belgian legislation demands a numeric account code; Exact pads it to 18 characters.
`@str:` keeps the code a string.

```sh
exactcli create crm/Accounts \
  --set Name="Acme NV" --set Code=@str:<code> \
  --set IsSales=true --set Status=C --dry-run
exactcli create crm/Accounts \
  --set Name="Acme NV" --set Code=@str:<code> \
  --set IsSales=true --set Status=C --allow-writes
```

From the documentation: the typed command builds the same body from flags.

```sh
exactcli account create --name "Acme NV" --code <code> \
  --customer true --status C --country BE --vat-number BE0123456789 --dry-run
```

Read the account back. `--search <code>` sends the padded code and the bare code with
`or`; a plain `--filter "Code eq '<code>'"` finds nothing.

```sh
exactcli account list --search <code>
exactcli account list --search Acme --customer true --status C
exactcli get crm/Accounts <guid> --select Code,Name,IsSales,Status
exactcli contact list --account <code>
```

Update and delete answer 204 with no body. The deleted account then shows in the
deleted feed with `EntityType` 2.

```sh
exactcli update crm/Accounts <guid> --set Name="Acme BV" --allow-writes
exactcli delete crm/Accounts <guid> --allow-writes --yes
exactcli deleted --since 0 --type 2
```

## 4. Post a sales entry (accounting) and see the transaction lines

Verified live. The typed `sales-entry create` step is From the documentation.

A sales entry books a customer invoice in the sales journal. You give the revenue line;
Exact posts the customer control account (400000 in the Belgian chart) itself. Find the
codes first.

```sh
exactcli journal list --type 20
exactcli gl-account list --search 700000
```

Post the entry. `@ref:` resolves the customer code to its GUID, padded or bare. The
answer carries the `EntryNumber` (26700001 live) and the status Open.

```sh
exactcli create salesentry/SalesEntries \
  --set Customer=@ref:crm/Accounts:<customer code> --set Journal=@str:700 \
  --body '{"SalesEntryLines":[{"GLAccount":"<700000 guid>","AmountFC":100}]}' \
  --dry-run
exactcli create salesentry/SalesEntries \
  --set Customer=@ref:crm/Accounts:<customer code> --set Journal=@str:700 \
  --body '{"SalesEntryLines":[{"GLAccount":"<700000 guid>","AmountFC":100}]}' \
  --allow-writes
```

From the documentation: the typed command resolves the codes for you. A line is
`<gl account>:<amount>[:description]`.

```sh
exactcli sales-entry create --customer <customer code> --journal 700 \
  --line "700000:100:Consulting September" --date 2026-09-03 \
  --invoice "<your reference>" --dry-run
```

Read the result. Live, the entry produced two transaction lines: 400000 debit 100 and
700000 credit -100.

```sh
exactcli sales-entry list --filter "EntryDate ge datetime'2026-09-01'"
exactcli transaction-line list --year 2026 --period 9
exactcli transaction-line list --account <customer code>
exactcli transaction-line list --gl-account 700000 --from 2026-09-01 --to 2026-09-30
exactcli delete salesentry/SalesEntries <entry guid> --allow-writes --yes
```

## 5. Post a general journal entry (OD) and its rules

Verified live.

A general journal entry is a manual booking in journal 800. Debit is positive, credit
negative. The live entry balanced: +50 on 499000 and -50 on 580600. Find the journal
and the VAT-free accounts (type 90) first.

```sh
exactcli journal list --type 90
exactcli gl-account list --type 90
exactcli journal-entry create --journal 800 \
  --line "499000:50:Transfer" --line 580600:-50 --date 2026-09-03 --dry-run
exactcli journal-entry create --journal 800 \
  --line 499000:50 --line 580600:-50 --date 2026-09-03 --allow-writes
exactcli journal-entry list --journal 800 --year 2026
exactcli transaction-line list --journal 800
```

The rules seen live:

- The lines carry `AmountFC`. `AmountDC` on input is ignored and stored as 0. The
  typed command sends `AmountFC`.
- Journal 800 refuses a bank account (type 12). The message is
  `Compte comptable: Type - Non autorise: Banque`. Book bank movements in the bank
  journal.
- Journal 800 has no VAT. It refuses an account with a default VAT code. The message
  is `Non autorise: Code TVA`. Use journal 890, or VAT-free accounts of type 90
  (49xxxx, 58xxxx).
- The header has no `Description` in the catalogue, so the CLI refuses it. Put the
  text on the lines, or send it with `--force` on the generic command.
- There is no PUT on this resource. To correct an entry, delete it and create it again.

```sh
exactcli delete generaljournalentry/GeneralJournalEntries <entry guid> --allow-writes --yes
exactcli create generaljournalentry/GeneralJournalEntries --set JournalCode=@str:800 \
  --body '{"GeneralJournalEntryLines":[{"GLAccount":"<499000 guid>","AmountFC":50},{"GLAccount":"<580600 guid>","AmountFC":-50}]}' \
  --allow-writes
```

## 6. Create a sales invoice from codes

Verified live. The print step is From the documentation.

A sales invoice line needs an `Item`; Exact fills the `GLAccount` from the item. The
customer needs `IsSales=true`. A line is `item:quantity:unit price[:description]`.

```sh
exactcli item list --sales true
exactcli journal list --type 20
exactcli invoice create --customer <customer code> --journal 700 \
  --line <item code>:2:100 --description "Acme order" --date 2026-09-03 --dry-run
exactcli invoice create --customer <customer code> --journal 700 \
  --line <item code>:2:100 --allow-writes
```

The dry run shows the resolved GUIDs. Live: AmountDC 200, status 20 Open, `Type` 8020,
and `InvoiceNumber` null until the invoice is printed or processed. Read it back:

```sh
exactcli sales-invoice list --customer <customer code> --status 20
exactcli list salesinvoice/SalesInvoiceLines --filter "InvoiceID eq guid'<invoice guid>'"
exactcli get salesinvoice/SalesInvoices <invoice guid> --expand SalesInvoiceLines --output json
exactcli delete salesinvoice/SalesInvoices <invoice guid> --allow-writes --yes
```

From the documentation: print the invoice. The POST creates a document with the PDF,
assigns the invoice number, sets the status to Processed, and posts the sales entry.
Filter the sales entries on that number to see the accounting side.

```sh
exactcli create salesinvoice/PrintedSalesInvoices --set InvoiceID=@guid:<invoice guid> --dry-run
exactcli sales-entry list --filter "InvoiceNumber eq <invoice number>"
exactcli document download <document guid> --out ./invoices
```

The generic form of the same invoice, verified live:

```sh
exactcli create salesinvoice/SalesInvoices --set Journal=@str:700 \
  --set OrderedBy=@guid:<customer guid> \
  --body '{"SalesInvoiceLines":[{"Item":"<item guid>","Quantity":2,"UnitPrice":100}]}' \
  --allow-writes
```

## 7. Sales order to invoice (order, delivery, invoice)

From the documentation. The sales order module needs a Wholesale Distribution or
Manufacturing subscription: the demo administration answered 403 Forbidden on
`salesorder/SalesOrders` (verified live).

Create the order from codes. A line is `item:quantity:unit price[:description]`.

```sh
exactcli sales-order create --customer <customer code> --line <item code>:5:50 \
  --delivery-date 2026-09-10 --reference "<customer reference>" --dry-run
exactcli sales-order create --customer <customer code> --line <item code>:5:50 \
  --delivery-date 2026-09-10 --allow-writes
exactcli sales-order list --customer <customer code> --status 12
```

Deliver the goods. Only an approved order can be delivered (`ApprovalStatus` 2, or 1
when the administration approves automatically). Read the line IDs first; the
delivered quantity may not exceed the remaining quantity. When the administration uses
storage locations, every line also needs a `StorageLocation` GUID from
`inventory/StorageLocations`.

```sh
exactcli list salesorder/SalesOrderLines --filter "OrderID eq guid'<order guid>'" \
  --select ID,ItemCode,Quantity,QuantityDelivered
exactcli create salesorder/GoodsDeliveries \
  --body '{"DeliveryDate":"2026-09-10","GoodsDeliveryLines":[{"SalesOrderLineID":"<line guid>","QuantityDelivered":5}]}' \
  --dry-run
```

Invoice the order. `CreateMode` 0 makes one invoice per customer, 1 one per order.
`InvoiceMode` 0 invoices the delivered quantities, 1 the ordered quantities. The
documentation says that only the asynchronous `Mode` (1) survives after October 2026;
the answer then carries a `ProcessID` for the result endpoint.

```sh
exactcli create salesinvoice/InvoiceSalesOrders \
  --body '{"CreateMode":1,"InvoiceMode":0,"JournalCode":"700","SalesOrderIDs":[{"ID":"<order guid>"}]}' \
  --dry-run
exactcli sales-invoice list --customer <customer code> --status 20
```

Then print the invoice as in recipe 6.

## 8. Documents and attachments (create with files, download)

Verified live. The link to an entry is From the documentation.

A document has a `Type`; `document-type list` shows the 126 types, and `--creatable`
keeps the ones a POST accepts (183 Attachment, 55 Miscellaneous, 50 Letter, 10 Sales
invoice, 20 Purchase invoice). `document create` makes one document and one attachment
per `--file`.

```sh
exactcli document-type list --creatable true
exactcli document create --subject "Acme contract" --type 183 --account <customer code> \
  --file contract.pdf --file annex.png --dry-run
exactcli document create --subject "Acme contract" --type 183 --account <customer code> \
  --file contract.pdf --file annex.png --allow-writes
```

List and download. A GET on `DocumentAttachments` answers `Attachment: null` and a
`Url`; `document download` fetches that URL with the bearer token and `Download=1` for
the raw bytes. Live, two files came back byte for byte.

```sh
exactcli document list --account <customer code> --from 2026-09-01
exactcli list documents/DocumentAttachments \
  --filter "Document eq guid'<document guid>'" --select ID,FileName,FileSize,Url
exactcli document download <document guid> --out ./attachments --force
```

The generic form, with the file as base64:

```sh
exactcli create documents/Documents --set Subject="Acme contract" --set Type=183 --allow-writes
exactcli create documents/DocumentAttachments --set Document=@guid:<document guid> \
  --set FileName=@str:contract.pdf --set Attachment=@str:<base64> --allow-writes
```

From the documentation: to attach the scan of an invoice to its entry, create the
document first (type 10 for a sales entry, 20 for a purchase entry), then put its GUID
in `Document` on the entry header.

```sh
exactcli create purchaseentry/PurchaseEntries --set Journal=@str:<purchase journal> \
  --set Supplier=@ref:crm/Accounts:<supplier code> --set Document=@guid:<document guid> \
  --body '{"PurchaseEntryLines":[{"GLAccount":"<cost account guid>","AmountFC":100}]}' \
  --dry-run
```

## 9. Incremental synchronisation for a mirror

Verified live. The state file is a local feature of the CLI.

The sync feeds page at 1000 rows and give every row a `Timestamp`: a row version, not
a date. Store the highest value and pass it on the next run. The deleted feed pairs
with the sync feeds; its log keeps two months. To start from a date instead of from
zero, ask the timestamp of that date for one feed.

```sh
exactcli sync timestamp --endpoint Accounts --modified 2026-01-01
exactcli sync crm/Accounts --since <timestamp> --output json
exactcli sync crm/Accounts --state ./sync.json --output json
```

The state file remembers the last timestamp per resource. `sync` reads it when
`--since` is absent and writes it after a complete run. A mirror of the ledger:

```sh
exactcli sync crm/Accounts --state ./sync.json --output json
exactcli sync financial/GLAccounts --state ./sync.json --output json
exactcli sync financialtransaction/TransactionLines --state ./sync.json --output csv
exactcli sync salesentry/SalesEntries --state ./sync.json --output json
exactcli sync purchaseentry/PurchaseEntries --state ./sync.json --output json
exactcli deleted --state ./sync.json --output json
exactcli deleted --state ./sync.json --type 1
```

The facts seen live. A feed call without `$select` answers 400 with
`Please add a $select or a $top=1 statement`. The CLI sends every catalogue field,
and `--select` narrows it.
Timestamps are Int64 and arrive as strings; the filter literal is `Timestamp gt <n>L`.
The accounting feeds live under `sync/Financial/...`; the CLI maps the regular path
for you. `deleted --type` filters on `EntityType`: 1 TransactionLines, 2 Accounts, 5
Contacts, 6 Documents, 7 GLAccounts, 9 Items, 13 SalesInvoices, 62 SalesEntries.

From the documentation: when a division moves to another database, its timestamps
reset. Check `DivisionMoveDate` on `system/Divisions` and sync again from zero. For a
push instead of a poll, subscribe to a webhook topic:

```sh
exactcli get system/Divisions <division code> --select Code,DivisionMoveDate
exactcli webhook create --topic Accounts --url https://acme.example/hooks/exact --dry-run
```

## 10. Payments and receivables (read)

Verified live: the lists answered empty on the demo administration, which holds only
Open entries. The approval step is From the documentation.

Receivables are the outstanding customer items, payments the outstanding supplier
items. Status: 20 open, 30 selected, 40 processed, 50 matched.

```sh
exactcli receivable list --status 20 --due-to 2026-09-30
exactcli receivable list --account <customer code> --all --output csv
exactcli payment list --status 20 --due-to 2026-09-30
exactcli payment list --account <supplier code> --search "<text>"
exactcli purchase-invoice list --supplier <supplier code> --status 20
exactcli bank-entry list --journal <bank journal code> --year 2026
```

From the documentation: approve a purchase entry for payment. A payment with method
`K` (cash) leaves the payment page of Exact Online; set it back to `B` (electronic) to
approve it. Find the payment through the entry it belongs to.

```sh
exactcli list cashflow/Payments \
  --filter "TransactionEntryID eq guid'<purchase entry guid>'" \
  --select ID,PaymentMethod,AmountDC,DueDate
exactcli update cashflow/Payments <payment guid> --set PaymentMethod=K --dry-run
exactcli update cashflow/Payments <payment guid> --set PaymentMethod=B --allow-writes
```

## 11. Trial balance and aging

From the documentation. The typed commands are new; the raw endpoints answered live,
empty on the demo administration.

`financial/ReportingBalance` sums the transactions per reporting year, period, ledger
account, cost centre, cost unit, type and status. Filter on one year for speed. Status
20 Open and 50 Processed are both included by default. `--type` picks B (balance
sheet) or W (profit and loss).

```sh
exactcli balance list --year 2026 --period 9
exactcli balance list --year 2026 --type W --all --output csv
exactcli balance list --year 2026 --gl-account 700000
exactcli financial-period list --year 2026
exactcli profit-loss list
```

The aging lists group the open items per customer or supplier by age group.

```sh
exactcli aging-receivable list
exactcli aging-receivable list --search Acme
exactcli aging-receivable list --account <customer code> --output json
exactcli aging-payable list --account <supplier code>
```

Verified live: the raw probes. The balance refuses `$top=2` without `$select`; `$top=1`
alone is accepted. On the demo administration an Open entry did not reach the balance.

```sh
exactcli api GET financial/ReportingBalance --query '$top=1'
exactcli api GET read/financial/AgingReceivablesList
exactcli api GET read/financial/ProfitLossOverview
```

## 12. Writes with an agent (MCP)

Verified live.

`exactcli mcp` runs a Model Context Protocol server over stdio. Without
`--allow-writes` it is read-only: six generic tools (`exact_resources`,
`exact_metadata`, `exact_list`, `exact_get`, `exact_me`, `exact_quota`) plus one tool
per typed command. With `--allow-writes` the server adds `exact_write`.

```sh
claude mcp add exact -- exactcli mcp --division <division code>
claude mcp add exact -- exactcli mcp --division <division code> --allow-writes
exactcli mcp --all-tools --allow-writes --tool-timeout 60
```

The flow for an agent has three steps. First, call `exact_write` with `dry_run: true`:
the tool answers the validated request and sends nothing. Second, repeat the call
without `dry_run` to send it. Third, a delete needs `confirm: true`; the server refuses
it before any process starts. The inputs of `exact_write`:

```json
{"operation":"create","resource":"crm/Accounts",
 "set":{"Name":"Acme NV","Code":"<code>","IsSales":true,"Status":"C"},"dry_run":true}
{"operation":"create","resource":"salesentry/SalesEntries",
 "set":{"Customer":"@ref:crm/Accounts:<code>","Journal":"700"},
 "body":{"SalesEntryLines":[{"GLAccount":"<700000 guid>","AmountFC":100}]}}
{"operation":"update","resource":"crm/Accounts","key":"<guid>","set":{"Name":"Acme BV"}}
{"operation":"delete","resource":"crm/Accounts","key":"<guid>","confirm":true}
```

`operation` is create, update or delete. `key` is the GUID or integer key of an
update or a delete. `body` is the request object; `set` holds flat fields merged over
it, and `@ref:service/Resource:code` resolves a code to a GUID. A body that the
catalogue rejects comes back as a tool error with the exit 64 message. Each tool call
runs `exactcli` as a child process under the profile and the division of the server;
`--tool-timeout` caps it at 120 seconds by default.

## Rules learned live

- Account codes are padded to 18 characters (`"                 1"`). An exact-code
  search must send the padded code; `--search <code>` and `@ref:` try both forms.
  Ledger codes are not padded (`"700000"`). VAT codes and payment condition codes carry
  trailing spaces (`"1  "`, `"0 "`).
- Belgian legislation demands numeric account codes. The message is
  `Le code du Tiers ne peut contenir que des chiffres`.
- A customer needs `IsSales=true` and `Status=C`. Without it, a sales entry or a sales
  invoice answers 500 `Invalide: Client (Type)`.
- Entry lines carry `AmountFC`. `AmountDC` on input is ignored and stored as 0.
- Journal 800 (OD) refuses a bank account (type 12) and an account with a default VAT
  code. Use journal 890 or VAT-free accounts of type 90. The resource has no PUT:
  delete and recreate. The header has no `Description`.
- Exact answers HTTP 500, not 400, to a business validation error on POST, with a
  message in the language of the user. The CLI maps it to exit 69; `--verbose` shows
  the message and the correlation id.
- The sync feeds need `$select` or `$top=1`; the CLI sends every catalogue field.
  Timestamps are Int64 strings; the filter literal is `Timestamp gt <n>L`. The
  accounting feeds live under `sync/Financial/...`. `financial/ReportingBalance`
  follows the same `$select` rule.
- `$top` changes the envelope: `{"d":[...]}` instead of `{"d":{"results":[...]}}`.
- Refresh chain: the access token lives 600 seconds. Refresh after 575, never before
  570 (401 `Access Token not expired`). Refresh tokens are single use and rotate. A
  second authorization for the same app and user kills the chain with the message
  `invalid or empty chainId`. A refresh token unused for 30 days expires.
- `current/Me` is quota free and carries no rate-limit headers. Every other call
  counts: 60 per minute, 5000 per day, sequential only.
- A sales invoice line needs an `Item`; `InvoiceNumber` stays null until the invoice
  is printed or processed. DELETE works on an open invoice.
- `salesorder/SalesOrders` answers 403 Forbidden without the sales order module.
- `read/sync/Sync/SyncTimestamp` accepts only `modified` and `endPoint`; any other
  query answers 400 `Error in query syntax`.
- A deleted record shows in `sync/Deleted` with its `EntityType` (2 = Accounts).
