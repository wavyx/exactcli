import { defineBookCommand } from '../../lib/typed/book-create.js'

export default defineBookCommand({
  topic: 'cash-entry',
  resource: 'financialtransaction/CashEntries',
  lines: 'CashEntryLines',
  what: 'cash movements',
  journal: '570',
  side: 'the cash box',
})
