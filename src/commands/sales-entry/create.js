import { defineEntryCreate } from '../../lib/typed/entry-create.js'

export default defineEntryCreate({
  topic: 'sales-entry',
  resource: 'salesentry/SalesEntries',
  party: 'Customer',
  partyLabel: 'Customer code or GUID (crm/Accounts with IsSales)',
  journal: '700',
  journalHint: 'Sales journal code, for example 700',
  lines: 'SalesEntryLines',
  invoice: { field: 'YourRef' },
})
