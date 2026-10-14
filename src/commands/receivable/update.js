import { defineRecordUpdateCommand } from '../../lib/typed/record-write.js'

export default defineRecordUpdateCommand({
  topic: 'receivable',
  resource: 'cashflow/Receivables',
  singular: 'a receivable',
  plural: 'receivables',
})
