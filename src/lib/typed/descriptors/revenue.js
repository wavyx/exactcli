/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'revenue',
  resource: 'read/financial/RevenueList',
  description: 'List the revenue per reporting year and period',
  examples: [
    '<%= config.bin %> revenue list --year 2026',
    '<%= config.bin %> revenue list --year 2026 --period 3 --output json',
  ],
  columns: ['Year', 'Period', 'Amount'],
  orderBy: 'Year desc',
  filters: {
    year: {
      field: 'Year',
      type: 'int',
      description: 'Reporting year',
    },
    period: {
      field: 'Period',
      type: 'int',
      description: 'Reporting period',
    },
  },
}

export default descriptor
