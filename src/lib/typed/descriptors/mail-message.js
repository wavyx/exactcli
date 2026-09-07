/** @type {import("../descriptors.js").Descriptor} */
const descriptor = {
  topic: 'mail-message',
  resource: 'mailbox/MailMessagesSent',
  description: 'List sent mail messages (digital postbox and scan service)',
  examples: [
    '<%= config.bin %> mail-message list --from 2026-01-01',
    '<%= config.bin %> mail-message list --operation 2 --status 50',
  ],
  columns: [
    'Subject',
    'Type',
    'Operation',
    'RecipientMailboxDescription',
    'RecipientStatusDescription',
    'SenderDateSent',
    'ID',
  ],
  orderBy: 'SenderDateSent desc',
  filters: {
    operation: {
      field: 'Operation',
      type: 'int',
      description:
        'Scan service operation: 1 purchase invoice without details, 2 with details, 3 sales invoice, 4 bank statement',
    },
    status: {
      field: 'RecipientStatus',
      type: 'int',
      description:
        'Recipient status: 5 rejected, 10 draft, 20 open, 25 prepared, 30 approved, 40 realized, 42 in process, 43 at the scanning service, 45 error, 46 blocked, 50 processed',
    },
    from: {
      field: 'SenderDateSent',
      op: 'ge',
      type: 'date',
      description: 'Sent date from (YYYY-MM-DD)',
    },
    to: {
      field: 'SenderDateSent',
      op: 'le',
      type: 'date',
      description: 'Sent date to (YYYY-MM-DD)',
    },
  },
}

export default descriptor
