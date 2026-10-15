---
title: Lines of a document
description: Add, update and delete the lines of entries, invoices, orders and quotations.
---

The header is named by its GUID or its number; the link to the header comes from the
argument only, so a body cannot move a line to another document.

| Topic                                                 | line-add | line-update | line-delete |
| ----------------------------------------------------- | -------- | ----------- | ----------- |
| sales-entry, purchase-entry                           | yes      | yes         | yes         |
| bank-entry, cash-entry                                | yes      | -           | -           |
| sales-invoice, sales-order, purchase-order, quotation | yes      | yes         | yes         |

```sh
exactcli sales-entry line-add 26700002 --set GLAccount=@ref:financial/GLAccounts:700000 \
  --set AmountFC=100 --set VATCode=5 --allow-writes
exactcli sales-entry line-update <line-id> --set Description="Fee" --allow-writes
exactcli purchase-entry line-delete <line-id> --allow-writes --yes
exactcli sales-order line-add 12 --set Item=@ref:logistics/Items:WIDGET --set Quantity=2 \
  --set UnitPrice=100 --allow-writes
```

## What Exact refuses

- A general journal entry line takes no POST, although the reference lists one.
- A purchase invoice line answers 403 to a POST: create the invoice with its lines.
- A PUT that changes only the quantity re-prices the line from the item: send the price
  with it.
- A sales invoice line may leave out the ledger account: Exact takes the one of the item.
