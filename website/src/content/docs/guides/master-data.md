---
title: Master data
description: Accounts, items, ledger accounts, journals, VAT codes and the other records.
---

## By code

Ledger accounts, journals, VAT codes, cost centers and cost units take `create`
(`--code`, `--description`, `--set`), `update` and `delete` by GUID or code. Payment
conditions take `create` only: Exact offers no PUT or DELETE there.

```sh
exactcli gl-account create --code 799000 --description "Other income" --set Type=110 --allow-writes
exactcli journal update 800 --set Description="General journal" --allow-writes
exactcli cost-center delete HQ --allow-writes --yes
exactcli payment-condition create --code 30D --description "30 days" --set PaymentDays=30 --allow-writes
```

## Accounts, contacts and items

```sh
exactcli account create --name Acme --code 1001 --customer true --status C --country BE --allow-writes
exactcli account update 1001 --name "Acme NV" --city Ghent --allow-writes
exactcli contact create --account 1001 --first-name Jane --last-name Doe --email jane@acme.example --allow-writes
exactcli item create --code WIDGET --description Widget --sales-price 99.5 --sales true --gl-revenue 700000 --allow-writes
exactcli account delete 1001 --allow-writes --yes
```

A contact is deleted by GUID only: its Code is the one of its account.

## More records

Opportunities, addresses, bank accounts, supplier item links, sales prices, exchange
rates, projects, warehouses, sales channels, depreciation methods, document folders,
subscriptions and project time and cost entries take `create`, `update` and `delete`,
with `--set` and `--body`. Tasks, events and communication notes take `create`; goods
receipts and goods deliveries take `create` and `update`.

```sh
exactcli opportunity create --set Name="Acme renewal" --set Account=@ref:crm/Accounts:1001 \
  --set CloseDate=2026-12-31 --set AmountFC=1000 --allow-writes
exactcli warehouse create --code W2 --description "Second warehouse" --allow-writes
```

Some records need set-up in the administration: time and cost entries need an employee
and a time item, a subscription needs an item with a time unit, and a linear
depreciation method takes its percentage as a fraction (`Percentage2=0.2`).
