import { defineBookCommand } from '../../lib/typed/book-create.js'

export default defineBookCommand({
  topic: 'bank-entry',
  resource: 'financialtransaction/BankEntries',
  lines: 'BankEntryLines',
  what: 'a bank statement',
  journal: '500',
  side: 'the bank',
})
