/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'payment',
  resource: 'cashflow/Payments',
  description: 'List payments (outstanding supplier items to pay)',
  examples: [
    '<%= config.bin %> payment list --status 20 --due-to 2026-09-30',
    '<%= config.bin %> payment list --account 2001 --all --output csv',
    '<%= config.bin %> payment list --entry <purchase-entry-id>',
  ],
  columns: [
    'AccountCode',
    'AccountName',
    'Description',
    'InvoiceNumber',
    'DueDate',
    'PaymentDateProposal',
    'AmountDC',
    'Status',
    'PaymentMethod',
    'PaymentSelected',
    'ID',
  ],
  orderBy: 'DueDate asc',
  filters: {
    account: {
      field: 'Account',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Supplier GUID or code',
    },
    entry: {
      field: 'TransactionEntryID',
      type: 'guid',
      description: 'The purchase entry (GUID) that created the payment',
    },
    'due-from': {
      field: 'DueDate',
      op: 'ge',
      type: 'date',
      description: 'Due date from (YYYY-MM-DD)',
    },
    'due-to': {
      field: 'DueDate',
      op: 'le',
      type: 'date',
      description: 'Due date to (YYYY-MM-DD)',
    },
    status: {
      field: 'Status',
      type: 'int',
      description: 'Status: 20 open, 30 selected, 40 processed, 50 matched',
    },
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains',
    },
  },
}

export default descriptor
