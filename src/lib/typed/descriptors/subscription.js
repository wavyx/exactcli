/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'subscription',
  resource: 'subscription/Subscriptions',
  description: 'List subscriptions (recurring invoice contracts)',
  examples: [
    '<%= config.bin %> subscription list --account 1001',
    '<%= config.bin %> subscription list --from 2026-01-01 --search hosting --all',
  ],
  columns: [
    'Number',
    'Description',
    'InvoiceToName',
    'StartDate',
    'EndDate',
    'Currency',
    'EntryID',
  ],
  orderBy: 'StartDate desc',
  filters: {
    account: {
      field: 'InvoiceTo',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Account GUID or code (the account that is invoiced)',
    },
    from: {
      field: 'StartDate',
      op: 'ge',
      type: 'date',
      description: 'Start date from (YYYY-MM-DD)',
    },
    to: {
      field: 'StartDate',
      op: 'le',
      type: 'date',
      description: 'Start date to (YYYY-MM-DD)',
    },
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains',
    },
  },
}

export default descriptor
