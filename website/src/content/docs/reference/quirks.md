---
title: Exact Online quirks
description: Behaviour of the Exact Online API that the reference documentation does not tell, found in live tests.
---

These facts come from live write tests on a Belgian test administration. The reference
documentation does not state them. Exact can change its behaviour, so treat each item as
"seen on the date of the test", not as a contract.

## General

- A line of a document can only be created together with its header. A POST on
  `GoodsDeliveryLines`, `GoodsReceiptLines`, `DropShipmentLines` or
  `PurchaseInvoiceLines` alone answers 403. A PUT and a DELETE on a line that exists work.
- A POST answer can echo `null` for fields that Exact did store, for example `Code` on a
  new warehouse or `Quantity` on a time entry. Read the record back to check it.
- Exact blocks an endpoint for one hour after ten errors in one hour. Fix the body before
  you send it again.
- A 403 on a write can come from the user rights (a role in "My Exact Online > Rights")
  or from the licence. When every role is ticked and the 403 stays, the licence lacks
  the module.
- Some resources exist only in the beta namespace, for example
  `cashflow/AllocationRule`. Use `--beta`.

## Sales and purchase orders

- The warehouse of a sales order is `WarehouseID`, not `Warehouse`.
- Drop shipment needs `DropShipment = 1` on the supplier item (`logistics/SupplierItem`),
  else the sales order answers "not allowed: drop shipment". A sales order line takes
  `UseDropShipment = 1`.
- A purchase order POST ignores `DropShipment` and the link to the sales order line.
  Create the drop shipment purchase order in the web interface (on-demand replenishment).
  `salesorder/DropShipments` then works through the API.
- A planned sales return takes no decimal quantity for an item without fractions, and two
  return lines on the same delivery line are refused.

## Projects and time

- An hour type is an item with `IsTime = true` and the unit `hour`.
- A subscription line needs an item whose unit is a period (`month`, `quarter`,
  `halfyear`, `year`). `IsTime` does not work there: it forces the unit to hours.
- A time entry goes to "submitted" with `HourStatus = 10` on a PUT. The approval is in the
  web interface.
- `project/TimeCorrections` refused a correction on an approved entry (status 20) with
  "Only allowed to correct finalized time entry".
- `ProjectHourBudgets` needs a project with `BudgetType = 1` (hours per hour type).
- `InvoiceTerms` needs a fixed price project (`Type = 2`), and a fixed price project needs
  `FixedPriceItem`.
- `ProjectPlanning` and `ProjectPlanningRecurring` need `Account`. The recurring planning
  refuses `EndDateOrAfter`.
- `ProjectAccountMutations` needs an account other than the project account and a start
  date after the project start. A PUT ignores `StartDate`.
- A rebilling restriction cannot be moved to a fixed price project.

## Stock

- A stock item needs a stock account on its item group. Without it, the item POST
  answers "mandatory: item group - G/L account: stock / costs".
- A warehouse transfer needs `EntryDate` and an `ItemWarehouses` link between the item
  and the target warehouse.
- A stock count takes `StockCountDate` and nested `StockCountLines` with `QuantityNew`.
  A count line POST alone was refused; a PUT and a DELETE on a nested line work.
- An assembly bill of material is created with its materials in one POST on
  `AssemblyBillOfMaterialHeader` (the item ID is the key). A material POST alone answers
  "Assembly bill of material not found". Assembly orders are read-only in the API.
- Batch and serial numbers: `DraftStockTransactionID` is a GUID that you choose. The
  POST worked with `StockTransactionType = 130` (goods receipt). A PUT is accepted only
  for a batch linked to a stock count line (type 195) or a warehouse transfer line (124,
  125), and for a serial number of a shop order issue (150).

## Manufacturing

- Material issues and shop order receipts need two accounts in the division settings:
  "work in progress" and "work in progress change" (a cost account).
- A work center needs a production area.
- A bill of material routing needs `OperationResource` and `RoutingStepType = 10`.
- A by-product is a shop order material plan with `Type = 2` and a negative planned
  quantity.

## Accounting and payments

- A G/L classification mapping takes a classification of the same scheme, and a PUT
  must send `GLSchemeID` again.
- A processed sales invoice refuses a PUT.
- Payment processing needs a `PaymentReference` on each payment and a valid own bank
  account. `BankExportDocumentsUrl` comes back with a double slash after the host.
- `cashflow/BankStatementUploadAttachments` answered a generic 500 for files that the web
  interface imports fine. Import bank statements in the web interface.
- `financial/ProcessReturn` needs the `Request` of a return. Exact creates one only when
  an accountant sends the return to the client for approval.

## Quotations and webhooks

- `crm/PrintQuotation` answered 500 through the API, also for a quotation that the web
  interface prints. Review, reopen, reject and accept work after a print.
- Exact ignores the webhook `Description` on POST and PUT.
- Exact signs a webhook with the secret of the app that the division signs in with, and
  sends a refused notification again later.
