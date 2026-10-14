---
title: Entries and invoices
description: Book sales, purchase, general, bank and cash entries, and create invoices.
---

Typed writes build the nested bodies of Exact from codes.

## Entries

```sh
exactcli sales-entry create --customer 1001 --journal 700 --line 700000:100:Consulting --allow-writes
exactcli purchase-entry create --supplier 2001 --journal 600 --line 611000:1250:Rent --allow-writes
exactcli purchase-entry create --supplier 2001 --journal 600 --line 611000:1250 --file invoice.pdf --allow-writes
exactcli journal-entry create --journal 800 --line 499000:50:Rent --line 580600:-50 --allow-writes
exactcli bank-entry create --journal 500 --line 400000:121:"Invoice 26700001" --account 1001 --allow-writes
exactcli cash-entry create --journal 570 --line 604000:-20:"Office supplies" --allow-writes
```

A line is `<gl account>:<amount>[:option=value...][:description]`. Options: `vat`,
`vat-amount`, `from` and `to` (spread the amount over a period), `quantity`,
`cost-center`, `cost-unit`; purchase entries add `non-deductible` and `private-use`, as
fractions (0.5 is 50%). `--file` creates a document, attaches the files and links it to
the entry. `journal-entry create` checks that the lines balance before it sends anything.

## Invoices

```sh
exactcli invoice create --customer 1001 --journal 700 --line Default:2:100 --dry-run
exactcli invoice create --customer 1001 --journal 700 \
  --line Default:1:1350:vat=F:"Service fee" --remarks "Reverse charge" --allow-writes
exactcli purchase-invoice create --supplier 2001 --journal 600 --line Default:2:100 --reference INV-2026-42 --allow-writes
exactcli sales-invoice print <id> --allow-writes
```

An invoice line is `item:quantity:unit price[:option=value...][:description]`. Options:
`vat`, `discount` (a fraction from 0 to 1), `gl-account`, `cost-center`, `cost-unit`.

## Credit notes

`--credit-note` needs a negative total: Exact books the signs as given.

```sh
exactcli invoice create --customer 1001 --journal 700 --line Default:-1:1350:vat=F --credit-note --allow-writes
exactcli purchase-entry create --supplier 2001 --journal 600 --line 611000:-150:vat=5 --credit-note --allow-writes
```

## Sales orders and quotations

```sh
exactcli sales-order create --customer 1001 --line Default:2:100 --delivery-date 2026-09-10 --allow-writes
exactcli sales-order invoice <order-id> --journal 700 --wait --allow-writes
exactcli quotation create --account 1001 --line Default:2:100 --close-date 2026-09-30 --allow-writes
exactcli quotation accept <id> --action 1 --allow-writes        # 1 = create a sales order
```

`sales-order invoice` queues the run and prints the `ProcessID`; `--wait` reads the
result until the run ends, and exits 65 on an error status or a failed invoice.

A quotation must be printed before `review`, `reject` or `accept`. In a live test, Exact
refused `quotation print` through the API (500 "Non autorise - Modification: Statut"),
also for a quotation created in the web interface. Print the quotation in Exact Online;
the other actions then work from the command line.

## Update and delete

Every header takes `delete`, and `update` where Exact accepts a PUT, by GUID or by
number. A number that names several headers, such as the versions of a quotation, must
be replaced by the GUID of one.

```sh
exactcli sales-entry update 26700005 --set Description="Corrected" --allow-writes
exactcli purchase-invoice delete 26600001 26600002 --allow-writes --yes
```
