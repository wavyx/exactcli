/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'budget',
  resource: 'budget/Budgets',
  description: 'List budgets (amounts per ledger account and period)',
  examples: [
    '<%= config.bin %> budget list --year 2026 --gl-account 700000',
    '<%= config.bin %> budget list --year 2026 --period 3 --scenario BUDGET --all',
  ],
  columns: [
    'GLAccountCode',
    'GLAccountDescription',
    'ReportingYear',
    'ReportingPeriod',
    'AmountDC',
    'BudgetScenarioCode',
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
      description: 'Ledger account code',
    },
    scenario: {
      field: 'BudgetScenarioCode',
      type: 'string',
      description: 'Budget scenario code',
    },
  },
}

export default descriptor
