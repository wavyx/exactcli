/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'contact',
  resource: 'crm/Contacts',
  description: 'List contacts (the persons of an account)',
  examples: [
    '<%= config.bin %> contact list --search jane',
    '<%= config.bin %> contact list --account 1001 --output json',
  ],
  columns: [
    'FullName',
    'Email',
    'Account',
    'AccountName',
    'JobTitleDescription',
    'BusinessPhone',
    'Mobile',
    'IsMainContact',
    'ID',
  ],
  orderBy: 'FullName asc',
  filters: {
    search: {
      field: 'FullName',
      type: 'search',
      description: 'Full name contains, or exact Code',
    },
    account: {
      field: 'Account',
      type: 'guid',
      resolve: 'crm/Accounts',
      description: 'Account GUID or code',
    },
    email: {
      field: 'Email',
      type: 'string',
      description: 'Exact email address',
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
