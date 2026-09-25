/**
 * @typedef {object} LineDescriptor
 * @property {string} topic command topic, the `lines` subcommand hangs under it
 * @property {string} parent `service/Resource` of the header
 * @property {string} parentKey GUID key of the header
 * @property {string} number readable number of the header, an integer
 * @property {string} resource `service/Resource` of the lines
 * @property {string} link field of a line that holds the header key
 * @property {string} description ends with the call, for docs/coverage.md
 * @property {string[]} columns default `$select` and table columns, in order
 */

/** @type {Record<string, LineDescriptor>} */
export const lineDescriptors = {
  salesInvoice: {
    topic: 'sales-invoice',
    parent: 'salesinvoice/SalesInvoices',
    parentKey: 'InvoiceID',
    number: 'InvoiceNumber',
    resource: 'salesinvoice/SalesInvoiceLines',
    link: 'InvoiceID',
    description:
      'List the lines of sales invoices, by invoice GUID or number (GET salesinvoice/SalesInvoiceLines)',
    columns: [
      'LineNumber',
      'ItemCode',
      'Description',
      'Quantity',
      'UnitPrice',
      'Discount',
      'AmountFC',
      'VATCode',
      'VATPercentage',
      'VATAmountFC',
      'GLAccountDescription',
      'InvoiceID',
    ],
  },
  salesEntry: {
    topic: 'sales-entry',
    parent: 'salesentry/SalesEntries',
    parentKey: 'EntryID',
    number: 'EntryNumber',
    resource: 'salesentry/SalesEntryLines',
    link: 'EntryID',
    description:
      'List the lines of sales entries, by entry GUID or number (GET salesentry/SalesEntryLines)',
    columns: [
      'LineNumber',
      'GLAccountCode',
      'GLAccountDescription',
      'Description',
      'AmountFC',
      'VATCode',
      'VATAmountFC',
      'From',
      'To',
      'EntryID',
    ],
  },
  purchaseEntry: {
    topic: 'purchase-entry',
    parent: 'purchaseentry/PurchaseEntries',
    parentKey: 'EntryID',
    number: 'EntryNumber',
    resource: 'purchaseentry/PurchaseEntryLines',
    link: 'EntryID',
    description:
      'List the lines of purchase entries, by entry GUID or number (GET purchaseentry/PurchaseEntryLines)',
    columns: [
      'LineNumber',
      'GLAccountCode',
      'GLAccountDescription',
      'Description',
      'AmountFC',
      'VATCode',
      'VATAmountFC',
      'From',
      'To',
      'EntryID',
    ],
  },
  journalEntry: {
    topic: 'journal-entry',
    parent: 'generaljournalentry/GeneralJournalEntries',
    parentKey: 'EntryID',
    number: 'EntryNumber',
    resource: 'generaljournalentry/GeneralJournalEntryLines',
    link: 'EntryID',
    description:
      'List the lines of general journal entries, by entry GUID or number (GET generaljournalentry/GeneralJournalEntryLines)',
    columns: [
      'LineNumber',
      'GLAccountCode',
      'GLAccountDescription',
      'AccountName',
      'Description',
      'AmountFC',
      'VATCode',
      'EntryID',
    ],
  },
  bankEntry: {
    topic: 'bank-entry',
    parent: 'financialtransaction/BankEntries',
    parentKey: 'EntryID',
    number: 'EntryNumber',
    resource: 'financialtransaction/BankEntryLines',
    link: 'EntryID',
    description:
      'List the lines of bank entries, by entry GUID or number (GET financialtransaction/BankEntryLines)',
    columns: [
      'LineNumber',
      'Date',
      'GLAccountCode',
      'AccountName',
      'Description',
      'AmountFC',
      'OurRef',
      'EntryID',
    ],
  },
  cashEntry: {
    topic: 'cash-entry',
    parent: 'financialtransaction/CashEntries',
    parentKey: 'EntryID',
    number: 'EntryNumber',
    resource: 'financialtransaction/CashEntryLines',
    link: 'EntryID',
    description:
      'List the lines of cash entries, by entry GUID or number (GET financialtransaction/CashEntryLines)',
    columns: [
      'LineNumber',
      'Date',
      'GLAccountCode',
      'AccountName',
      'Description',
      'AmountFC',
      'OurRef',
      'EntryID',
    ],
  },
  salesOrder: {
    topic: 'sales-order',
    parent: 'salesorder/SalesOrders',
    parentKey: 'OrderID',
    number: 'OrderNumber',
    resource: 'salesorder/SalesOrderLines',
    link: 'OrderID',
    description:
      'List the lines of sales orders, by order GUID or number (GET salesorder/SalesOrderLines)',
    columns: [
      'LineNumber',
      'ItemCode',
      'Description',
      'Quantity',
      'UnitPrice',
      'AmountFC',
      'QuantityDelivered',
      'QuantityInvoiced',
      'DeliveryDate',
      'OrderID',
    ],
  },
  purchaseOrder: {
    topic: 'purchase-order',
    parent: 'purchaseorder/PurchaseOrders',
    parentKey: 'PurchaseOrderID',
    number: 'OrderNumber',
    resource: 'purchaseorder/PurchaseOrderLines',
    link: 'PurchaseOrderID',
    description:
      'List the lines of purchase orders, by order GUID or number (GET purchaseorder/PurchaseOrderLines)',
    columns: [
      'LineNumber',
      'ItemCode',
      'Description',
      'QuantityInPurchaseUnits',
      'UnitPrice',
      'AmountFC',
      'ReceivedQuantity',
      'ReceiptDate',
      'PurchaseOrderID',
    ],
  },
  quotation: {
    topic: 'quotation',
    parent: 'crm/Quotations',
    parentKey: 'QuotationID',
    number: 'QuotationNumber',
    resource: 'crm/QuotationLines',
    link: 'QuotationID',
    description:
      'List the lines of quotations, by quotation GUID or number; a number matches every version (GET crm/QuotationLines)',
    columns: [
      'LineNumber',
      'ItemDescription',
      'Description',
      'Quantity',
      'UnitPrice',
      'AmountFC',
      'VATCode',
      'QuotationID',
    ],
  },
  purchaseInvoice: {
    topic: 'purchase-invoice',
    parent: 'purchase/PurchaseInvoices',
    parentKey: 'ID',
    number: 'EntryNumber',
    resource: 'purchase/PurchaseInvoiceLines',
    link: 'InvoiceID',
    description:
      'List the lines of purchase invoices, by invoice GUID or entry number (GET purchase/PurchaseInvoiceLines)',
    columns: [
      'LineNumber',
      'Item',
      'Description',
      'Quantity',
      'UnitPrice',
      'Amount',
      'VATCode',
      'VATAmount',
      'InvoiceID',
    ],
  },
}
