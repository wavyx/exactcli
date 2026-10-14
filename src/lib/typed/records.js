import { findResource } from '../catalog.js'

/**
 * The write commands of resources keyed by one ID, built by record-write.js.
 * A resource with a Code takes a code wherever it takes a GUID; one with a
 * Code and a Description also takes --code and --description on create.
 * @type {Record<string, import('./record-write.js').RecordSpec & { methods: string[] }>}
 */
export const records = {
  account: ['crm/Accounts', 'an account', 'accounts', ['delete']],
  contact: ['crm/Contacts', 'a contact', 'contacts', ['delete']],
  item: ['logistics/Items', 'an item', 'items', ['delete']],
  address: ['crm/Addresses', 'an address', 'addresses'],
  bankAccount: ['crm/BankAccounts', 'a bank account', 'bank accounts'],
  opportunity: ['crm/Opportunities', 'an opportunity', 'opportunities'],
  supplierItem: [
    'logistics/SupplierItem',
    'a supplier item link',
    'supplier item links',
  ],
  salesPrice: ['logistics/SalesItemPrices', 'a sales price', 'sales prices'],
  document: [
    'documents/Documents',
    'a document',
    'documents',
    ['update', 'delete'],
  ],
  documentFolder: [
    'documents/DocumentFolders',
    'a document folder',
    'document folders',
  ],
  exchangeRate: [
    'financial/ExchangeRates',
    'an exchange rate',
    'exchange rates',
  ],
  subscription: [
    'subscription/Subscriptions',
    'a subscription',
    'subscriptions',
  ],
  project: ['project/Projects', 'a project', 'projects'],
  timeEntry: ['project/TimeTransactions', 'a time entry', 'time entries'],
  costEntry: ['project/CostTransactions', 'a cost entry', 'cost entries'],
  warehouse: ['inventory/Warehouses', 'a warehouse', 'warehouses'],
  depreciationMethod: [
    'assets/DepreciationMethods',
    'a depreciation method',
    'depreciation methods',
  ],
  salesChannel: ['sales/SalesChannels', 'a sales channel', 'sales channels'],
  task: ['activities/Tasks', 'a task', 'tasks', ['create']],
  event: ['activities/Events', 'an event', 'events', ['create']],
  communicationNote: [
    'activities/CommunicationNotes',
    'a communication note',
    'communication notes',
    ['create'],
  ],
  goodsReceipt: [
    'purchaseorder/GoodsReceipts',
    'a goods receipt',
    'goods receipts',
    ['create', 'update'],
  ],
  goodsDelivery: [
    'salesorder/GoodsDeliveries',
    'a goods delivery',
    'goods deliveries',
    ['create', 'update'],
  ],
}

const TOPICS = {
  bankAccount: 'bank-account',
  supplierItem: 'supplier-item',
  salesPrice: 'sales-price',
  documentFolder: 'document-folder',
  exchangeRate: 'exchange-rate',
  timeEntry: 'time-entry',
  costEntry: 'cost-entry',
  depreciationMethod: 'depreciation-method',
  salesChannel: 'sales-channel',
  communicationNote: 'communication-note',
  goodsReceipt: 'goods-receipt',
  goodsDelivery: 'goods-delivery',
}

for (const [key, [resource, singular, plural, methods]] of Object.entries(
  records,
)) {
  const names = new Set(findResource(resource).properties.map((p) => p.name))
  records[key] = {
    topic: TOPICS[key] ?? key,
    resource,
    singular,
    plural,
    methods: methods ?? ['create', 'update', 'delete'],
    // A contact carries the Code of its account, not one of its own.
    byCode: names.has('Code') && key !== 'contact',
    codeFlags: names.has('Code') && names.has('Description'),
  }
}
