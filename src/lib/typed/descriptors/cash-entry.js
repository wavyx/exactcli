/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'cash-entry',
  resource: 'financialtransaction/CashEntries',
  description: 'List cash entries (cash book headers)',
  examples: [
    '<%= config.bin %> cash-entry list --journal 57 --year 2026',
    '<%= config.bin %> cash-entry list --year 2026 --period 9 --all --output csv',
  ],
  columns: [
    'EntryNumber',
    'JournalCode',
    'JournalDescription',
    'FinancialYear',
    'FinancialPeriod',
    'OpeningBalanceFC',
    'ClosingBalanceFC',
    'StatusDescription',
    'EntryID',
  ],
  orderBy: 'EntryNumber desc',
  filters: {
    journal: {
      field: 'JournalCode',
      type: 'string',
      description: 'Cash journal code',
    },
    year: {
      field: 'FinancialYear',
      type: 'int',
      description: 'Financial year',
    },
    period: {
      field: 'FinancialPeriod',
      type: 'int',
      description: 'Financial period',
    },
  },
}

export default descriptor
