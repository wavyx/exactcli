/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'journal-entry',
  resource: 'generaljournalentry/GeneralJournalEntries',
  description: 'List general journal entries (manual bookings)',
  examples: [
    '<%= config.bin %> journal-entry list --journal 800 --year 2026',
    '<%= config.bin %> journal-entry list --year 2026 --period 9 --status 20 --all',
  ],
  columns: [
    'EntryNumber',
    'JournalCode',
    'JournalDescription',
    'FinancialYear',
    'FinancialPeriod',
    'Currency',
    'StatusDescription',
    'TypeDescription',
    'EntryID',
  ],
  orderBy: 'EntryNumber desc',
  filters: {
    journal: {
      field: 'JournalCode',
      type: 'string',
      description: 'Journal code',
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
    status: {
      field: 'Status',
      type: 'int',
      description: 'Status code, for example 20 (open) or 50 (processed)',
    },
  },
}

export default descriptor
