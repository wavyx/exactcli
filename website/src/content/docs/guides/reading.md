---
title: Reading data
description: Typed lists, generic reads, the catalogue and reports.
---

## Typed lists

Typed lists show readable columns and take filters that know the accounting fields.
`--account`, `--customer` and `--supplier` take a code or a GUID.

```sh
exactcli account list --search acme --customer yes
exactcli transaction-line list --year 2026 --period 9 --gl-account 700000
exactcli sales-invoice list --customer 1001 --from 2026-01-01 --status 20
exactcli receivable list --status 20 --due-to 2026-09-30
exactcli balance list --year 2026 --period 9
exactcli aging-receivable list --search acme
exactcli opening-balance list --year previous --processed
```

Every list takes `--count` (one OData `$count` call), `--limit`, `--all` and a free
`--filter` that combines with the typed filters.

## The lines of a document

```sh
exactcli sales-invoice lines 26700001 26700002
exactcli purchase-entry lines 26600001 --output json
exactcli sales-order lines 12
```

## Any resource

The built-in catalogue knows the 436 REST resources of Exact Online. Pass the
`service/Resource` path to the generic commands:

```sh
exactcli list crm/Accounts --top 5 --select Name
exactcli list financial/GLAccounts --all --output json
exactcli get crm/Accounts <guid> --expand BankAccounts
exactcli lookup crm/Accounts --match Code=1001 --one --jq .ID
exactcli api GET /api/v1/current/Me
```

## The catalogue

```sh
exactcli metadata --search invoice          # which resources match a word
exactcli metadata salesentry/SalesEntries   # fields, types, mandatory, filterable
exactcli metadata crm/Accounts --methods    # methods, keys, webhook
exactcli probe crm/Accounts                 # compare live fields with the catalogue
```

## Dates

Exact sends dates as `/Date(ms)/` in CET wall-clock time. exactcli prints them as
`2026-01-31T14:05:00`; `--raw` keeps the API envelope untouched.
