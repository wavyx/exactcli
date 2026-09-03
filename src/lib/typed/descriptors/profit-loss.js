/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'profit-loss',
  resource: 'read/financial/ProfitLossOverview',
  description:
    'List the profit and loss overview (revenue, costs and result of the current year and period)',
  examples: [
    '<%= config.bin %> profit-loss list',
    '<%= config.bin %> profit-loss list --output json',
  ],
  columns: [
    'CurrentPeriod',
    'RevenueCurrentPeriod',
    'CostsCurrentPeriod',
    'ResultCurrentPeriod',
    'RevenueCurrentYear',
    'CostsCurrentYear',
    'ResultCurrentYear',
    'CurrencyCode',
    'CurrentYear',
  ],
  orderBy: 'CurrentYear desc',
  // The catalogue marks no filterable field: the overview is one record for
  // the current year, so a raw --filter is the only filter.
  filters: {},
}

export default descriptor
