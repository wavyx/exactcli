/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'bank-entry',
  resource: 'financialtransaction/BankEntries',
  description: 'List bank entries (bank statement headers)',
  examples: [
    '<%= config.bin %> bank-entry list --journal 55 --year 2026',
    '<%= config.bin %> bank-entry list --year 2026 --period 9 --all --output csv',
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
      description: 'Bank journal code',
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
