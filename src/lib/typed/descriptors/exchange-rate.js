/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'exchange-rate',
  resource: 'financial/ExchangeRates',
  description:
    'List exchange rates (one rate per currency pair and start date)',
  examples: [
    '<%= config.bin %> exchange-rate list --source USD',
    '<%= config.bin %> exchange-rate list --from 2026-01-01 --to 2026-03-31 --all',
  ],
  columns: [
    'SourceCurrency',
    'TargetCurrency',
    'Rate',
    'StartDate',
    'Created',
    'ID',
  ],
  orderBy: 'StartDate desc',
  filters: {
    source: {
      field: 'SourceCurrency',
      type: 'string',
      description: 'Foreign currency code, for example USD',
    },
    target: {
      field: 'TargetCurrency',
      type: 'string',
      description: 'Division currency code, for example EUR',
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
