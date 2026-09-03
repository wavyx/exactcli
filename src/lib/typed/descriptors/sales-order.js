/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'sales-order',
  resource: 'salesorder/SalesOrders',
  description: 'List sales orders (the orders placed by customers)',
  examples: [
    '<%= config.bin %> sales-order list --from 2026-01-01 --to 2026-01-31',
    '<%= config.bin %> sales-order list --customer 1001 --status 12 --all',
  ],
  columns: [
    'OrderNumber',
    'OrderDate',
    'OrderedByName',
    'Description',
    'AmountDC',
    'StatusDescription',
    'DeliveryDate',
    'YourRef',
    'OrderID',
  ],
  orderBy: 'OrderDate desc',
  filters: {
    customer: {
      field: 'OrderedBy',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Customer GUID or code (the account that ordered)',
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
      field: 'Status',
      type: 'int',
      description:
        'Status code: 12 open, 20 partial, 21 complete, 45 cancelled',
    },
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains',
    },
  },
}

export default descriptor
