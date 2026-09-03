/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'webhook',
  resource: 'webhooks/WebhookSubscriptions',
  description:
    'List webhook subscriptions (the callbacks Exact calls per topic)',
  examples: [
    '<%= config.bin %> webhook list --topic Accounts',
    '<%= config.bin %> webhook list --search acme --output json',
  ],
  columns: [
    'Topic',
    'CallbackURL',
    'Description',
    'CreatorFullName',
    'Created',
    'ID',
  ],
  orderBy: 'Topic asc',
  filters: {
    topic: {
      field: 'Topic',
      type: 'string',
      description: 'Subscription topic, for example Accounts or Items',
    },
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains',
    },
    instant: {
      field: 'IsInstant',
      type: 'bool',
      description: 'Instant delivery subscriptions only (true or false)',
    },
  },
}

export default descriptor
