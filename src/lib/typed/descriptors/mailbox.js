/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'mailbox',
  resource: 'mailbox/Mailboxes',
  description: 'List mailboxes (the addresses of the digital postbox)',
  examples: [
    '<%= config.bin %> mailbox list --search postbox',
    '<%= config.bin %> mailbox list --account 1001 --type 1',
  ],
  columns: [
    'Mailbox',
    'Description',
    'AccountName',
    'Type',
    'Publish',
    'ValidFrom',
    'ValidTo',
    'ID',
  ],
  orderBy: 'Mailbox asc',
  filters: {
    search: {
      field: 'Description',
      type: 'search',
      description: 'Description contains',
    },
    account: {
      field: 'Account',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Account GUID or code (the owner of the mailbox)',
    },
    type: {
      field: 'Type',
      type: 'int',
      description:
        'Mailbox type: 0 unknown, 1 Exact, 2 government, 3 manual input',
    },
  },
}

export default descriptor
