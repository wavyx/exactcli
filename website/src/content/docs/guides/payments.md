---
title: Payments and collections
description: Approve supplier payments, manage SEPA mandates and prepare direct debits.
---

## Supplier payments

The "Approve payments" flow of Exact: payment method B shows a purchase entry on the
payments page, K holds it, and `payment process` sends the selected payments to the
bank export.

```sh
exactcli payment list --status 20 --due-to 2026-09-30
exactcli payment approve <payment-id> --allow-writes
exactcli payment hold <payment-id> --allow-writes
exactcli payment process <payment-id> <payment-id> --allow-writes
```

`payment process` exits 65 when Exact answers with an ErrorMessage: nothing was
processed then. In a live test Exact refused a payment without a payment reference, and
any payment while the bank account of the division was invalid. Set the reference first:

```sh
exactcli update cashflow/Payments <payment-id> --set PaymentReference="Invoice 1001" --allow-writes
```

## Direct debit mandates

SEPA Core or B2B. `mandate create` finds the bank account of the debtor by IBAN, or
takes its GUID.

```sh
exactcli mandate list --account 1001
exactcli mandate create --account 1001 --iban BE68539007547034 --reference ACME-001 \
  --type b2b --signature-date 2026-10-01 --allow-writes
exactcli mandate update <id> --set CancellationDate=2026-10-14 --allow-writes
exactcli mandate delete <id> --allow-writes --yes
```

## Collect receivables

`receivable collect` prepares receivables for a direct debit: payment method I, an
optional mandate, description and payment reference. It takes a receivable GUID or the
invoice number of one open receivable.

```sh
exactcli receivable collect 26700002 --mandate <mandate-id> --allow-writes
exactcli receivable update <id> --set PaymentMethod=B --allow-writes
```

## Bank statements and the postbox

```sh
exactcli bank-statement upload --file statement.cod --allow-writes
exactcli mailbox upload --file invoice.pdf --operation 2 --allow-writes
```

In a live test Exact created the document, then answered a generic 500 on the
attachment (`BankStatementUploadAttachments`), although the same CODA file imported fine
in the web interface. If the upload fails that way, import the file in Exact Online.
