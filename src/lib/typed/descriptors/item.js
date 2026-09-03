/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'item',
  resource: 'logistics/Items',
  description: 'List items (products and services)',
  examples: [
    '<%= config.bin %> item list --search widget',
    '<%= config.bin %> item list --sales yes --stock yes --all',
  ],
  columns: [
    'Code',
    'Description',
    'IsSalesItem',
    'IsPurchaseItem',
    'StandardSalesPrice',
    'CostPriceStandard',
    'Unit',
    'IsStockItem',
    'ID',
  ],
  orderBy: 'Code asc',
  filters: {
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains, or exact Code',
    },
    sales: {
      field: 'IsSalesItem',
      type: 'bool',
      description: 'Sales items only (true or false)',
    },
    purchase: {
      field: 'IsPurchaseItem',
      type: 'bool',
      description: 'Purchase items only (true or false)',
    },
    stock: {
      field: 'IsStockItem',
      type: 'bool',
      description: 'Stock items only (true or false)',
    },
  },
}

export default descriptor
