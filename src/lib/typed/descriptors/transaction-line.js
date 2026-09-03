/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'transaction-line',
  resource: 'financialtransaction/TransactionLines',
  description: 'List transaction lines (general ledger detail)',
  examples: [
    '<%= config.bin %> transaction-line list --year 2026 --period 9',
    '<%= config.bin %> transaction-line list --from 2026-01-01 --to 2026-01-31 --gl-account 700000',
    '<%= config.bin %> transaction-line list --account 1001 --all --output csv',
  ],
  columns: [
    'Date',
    'FinancialYear',
    'FinancialPeriod',
    'GLAccountCode',
    'GLAccountDescription',
    'AccountName',
    'Description',
    'AmountDC',
    'VATCode',
    'JournalCode',
    'EntryNumber',
    'ID',
  ],
  orderBy: 'Date desc',
  filters: {
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
    from: {
      field: 'Date',
      op: 'ge',
      type: 'date',
      description: 'Date from (YYYY-MM-DD)',
    },
    to: {
      field: 'Date',
      op: 'le',
      type: 'date',
      description: 'Date to (YYYY-MM-DD)',
    },
    'gl-account': {
      field: 'GLAccountCode',
      type: 'string',
      description: 'General ledger account code',
    },
    account: {
      field: 'Account',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Account GUID or code',
    },
    journal: {
      field: 'JournalCode',
      type: 'string',
      description: 'Journal code',
    },
  },
}

export default descriptor
