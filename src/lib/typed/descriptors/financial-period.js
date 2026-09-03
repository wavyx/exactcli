/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'financial-period',
  resource: 'financial/FinancialPeriods',
  description: 'List financial periods (the bookkeeping calendar)',
  examples: [
    '<%= config.bin %> financial-period list --year 2026',
    '<%= config.bin %> financial-period list --from 2026-01-01 --to 2026-12-31',
  ],
  columns: [
    'FinYear',
    'FinPeriod',
    'StartDate',
    'EndDate',
    'Created',
    'Modified',
    'ID',
  ],
  orderBy: 'StartDate asc',
  filters: {
    year: {
      field: 'FinYear',
      type: 'int',
      description: 'Financial year',
    },
    period: {
      field: 'FinPeriod',
      type: 'int',
      description: 'Financial period',
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
  },
}

export default descriptor
