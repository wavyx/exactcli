/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'purchase-order',
  resource: 'purchaseorder/PurchaseOrders',
  description: 'List purchase orders (the orders placed with suppliers)',
  examples: [
    '<%= config.bin %> purchase-order list --from 2026-01-01 --to 2026-01-31',
    '<%= config.bin %> purchase-order list --supplier 2001 --status 10 --all',
  ],
  columns: [
    'OrderNumber',
    'OrderDate',
    'SupplierName',
    'Description',
    'AmountDC',
    'OrderStatus',
    'ReceiptDate',
    'YourRef',
    'PurchaseOrderID',
  ],
  orderBy: 'OrderDate desc',
  filters: {
    supplier: {
      field: 'Supplier',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Supplier GUID or code (the account that delivers)',
    },
    from: {
      field: 'OrderDate',
      op: 'ge',
      type: 'date',
      description: 'Order date from (YYYY-MM-DD)',
    },
    to: {
      field: 'OrderDate',
      op: 'le',
      type: 'date',
      description: 'Order date to (YYYY-MM-DD)',
    },
    status: {
      field: 'OrderStatus',
      type: 'int',
      description:
        'Order status: 10 open, 20 partial, 30 complete, 40 cancelled',
    },
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains',
    },
  },
}

export default descriptor
