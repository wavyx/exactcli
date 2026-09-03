/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'asset',
  resource: 'assets/Assets',
  description: 'List fixed assets (investments and their depreciation status)',
  examples: [
    '<%= config.bin %> asset list --search laptop --status 1',
    '<%= config.bin %> asset list --from 2026-01-01 --to 2026-12-31 --all',
  ],
  columns: [
    'Code',
    'Description',
    'AssetGroupDescription',
    'StartDate',
    'InvestmentAmountDC',
    'ResidualValue',
    'Status',
    'ID',
  ],
  orderBy: 'Code asc',
  filters: {
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains, or exact Code',
    },
    status: {
      field: 'Status',
      type: 'int',
      description: 'Status code',
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
