/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'item-group',
  resource: 'logistics/ItemGroups',
  description: 'List item groups (the ledger accounts that items book to)',
  examples: [
    '<%= config.bin %> item-group list',
    '<%= config.bin %> item-group list --search parts --default 1',
  ],
  columns: [
    'Code',
    'Description',
    'GLRevenueCode',
    'GLCostsCode',
    'GLPurchaseAccountCode',
    'GLStockCode',
    'IsDefault',
    'ID',
  ],
  orderBy: 'Code asc',
  filters: {
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains, or exact Code',
    },
    default: {
      field: 'IsDefault',
      type: 'int',
      description: 'Default group flag: 1 default, 0 other',
    },
  },
}

export default descriptor
