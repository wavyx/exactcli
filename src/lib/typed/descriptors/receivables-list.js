/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'receivables-list',
  resource: 'read/financial/ReceivablesList',
  description: 'List open receivable invoices per customer (financial report)',
  examples: [
    '<%= config.bin %> receivables-list list --due-to 2026-09-30',
    '<%= config.bin %> receivables-list list --account 1001 --output json',
  ],
  columns: [
    'AccountCode',
    'AccountName',
    'InvoiceNumber',
    'InvoiceDate',
    'DueDate',
    'Amount',
    'Description',
    'CurrencyCode',
    'HID',
  ],
  orderBy: 'DueDate asc',
  filters: {
    search: {
      field: 'AccountName',
      type: 'search',
      description: 'Account name contains (a code goes to --account)',
    },
    account: {
      field: 'AccountId',
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
  },
}

export default descriptor
