/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'receivable',
  resource: 'cashflow/Receivables',
  description: 'List receivables (outstanding customer items)',
  examples: [
    '<%= config.bin %> receivable list --status 20 --due-to 2026-09-30',
    '<%= config.bin %> receivable list --account 1001 --all --output csv',
  ],
  columns: [
    'AccountCode',
    'AccountName',
    'Description',
    'InvoiceNumber',
    'DueDate',
    'AmountDC',
    'PaymentCondition',
    'Status',
    'ID',
  ],
  orderBy: 'DueDate asc',
  filters: {
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains',
    },
    account: {
      field: 'Account',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Account GUID or code',
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
  },
}

export default descriptor
