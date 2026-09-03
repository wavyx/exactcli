/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'currency',
  resource: 'general/Currencies',
  description: 'List currencies (the currency codes of the division)',
  examples: [
    '<%= config.bin %> currency list',
    '<%= config.bin %> currency list --search euro --output json',
  ],
  columns: ['Code', 'Description', 'Created', 'Modified'],
  orderBy: 'Code asc',
  filters: {
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains',
    },
    since: {
      field: 'Modified',
      op: 'ge',
      type: 'date',
      description: 'Modified on or after (YYYY-MM-DD)',
    },
  },
}

export default descriptor
