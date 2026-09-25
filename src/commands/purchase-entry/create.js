import { defineEntryCreate } from '../../lib/typed/entry-create.js'

export default defineEntryCreate({
  topic: 'purchase-entry',
  resource: 'purchaseentry/PurchaseEntries',
  party: 'Supplier',
  partyLabel: 'Supplier code or GUID (crm/Accounts with IsSupplier)',
  journal: '600',
  journalHint: 'Purchase journal code, for example 600',
  lines: 'PurchaseEntryLines',
  invoice: { field: 'InvoiceNumber', integer: true },
  documentType: 20,
  creditNoteType: 31,
  lineOptions: {
    // Exact stores these shares as fractions: 0.5 is 50% (verified live).
    'non-deductible': { field: 'VATNonDeductiblePercentage', type: 'fraction' },
    'private-use': { field: 'PrivateUsePercentage', type: 'fraction' },
  },
})
