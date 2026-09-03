/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'balance',
  resource: 'financial/ReportingBalance',
  description: 'List the trial balance per ledger account and period',
  examples: [
    '<%= config.bin %> balance list --year 2026 --all',
    '<%= config.bin %> balance list --year 2026 --period 3 --type W',
  ],
  columns: [
    'GLAccountCode',
    'GLAccountDescription',
    'ReportingYear',
    'ReportingPeriod',
    'AmountDebit',
    'AmountCredit',
    'Amount',
    'Count',
    'BalanceType',
    'ID',
  ],
  orderBy: 'GLAccountCode asc',
  filters: {
    year: {
      field: 'ReportingYear',
      type: 'int',
      description: 'Reporting year',
    },
    period: {
      field: 'ReportingPeriod',
      type: 'int',
      description: 'Reporting period',
    },
    'gl-account': {
      field: 'GLAccountCode',
      type: 'string',
      description: 'Ledger account code, for example 700000',
    },
    type: {
      field: 'BalanceType',
      type: 'string',
      description: 'Balance type: B balance sheet, W profit and loss',
    },
    status: {
      field: 'Status',
      type: 'int',
      description: 'Status code: 20 open, 50 processed',
    },
  },
}

export default descriptor
