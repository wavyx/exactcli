/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'goods-delivery',
  resource: 'salesorder/GoodsDeliveries',
  description: 'List goods deliveries (the shipments of sales orders)',
  examples: [
    '<%= config.bin %> goods-delivery list --from 2026-01-01 --to 2026-01-31',
    '<%= config.bin %> goods-delivery list --account 1001 --search urgent --all',
  ],
  columns: [
    'DeliveryNumber',
    'DeliveryDate',
    'DeliveryAccountName',
    'Description',
    'ShippingMethodDescription',
    'TrackingNumber',
    'EntryID',
  ],
  orderBy: 'DeliveryDate desc',
  filters: {
    account: {
      field: 'DeliveryAccount',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Delivery account GUID or code (the account that receives)',
    },
    from: {
      field: 'DeliveryDate',
      op: 'ge',
      type: 'date',
      description: 'Delivery date from (YYYY-MM-DD)',
    },
    to: {
      field: 'DeliveryDate',
      op: 'le',
      type: 'date',
      description: 'Delivery date to (YYYY-MM-DD)',
    },
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains',
    },
  },
}

export default descriptor
