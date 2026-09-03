/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'journal',
  resource: 'financial/Journals',
  description: 'List journals (cash, bank, sales, purchase, general)',
  examples: [
    '<%= config.bin %> journal list',
    '<%= config.bin %> journal list --type 12 --search bank',
  ],
  columns: [
    'Code',
    'Description',
    'Type',
    'GLAccountCode',
    'GLAccountDescription',
    'Currency',
    'IsBlocked',
    'ID',
  ],
  orderBy: 'Code asc',
  filters: {
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains, or exact Code',
    },
    type: {
      field: 'Type',
      type: 'int',
      description:
        'Journal type: 10 cash, 12 bank, 16 payment service, 20 sales, 22 purchase, 90 general',
    },
  },
}

export default descriptor
