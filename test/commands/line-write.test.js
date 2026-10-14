import { describe, it, expect } from 'vitest'
import { lineDescriptors } from '../../src/lib/typed/line-descriptors.js'
import SalesEntryLineAdd from '../../src/commands/sales-entry/line-add.js'
import PurchaseEntryLineAdd from '../../src/commands/purchase-entry/line-add.js'
import JournalEntryLineAdd from '../../src/commands/journal-entry/line-add.js'
import BankEntryLineAdd from '../../src/commands/bank-entry/line-add.js'
import CashEntryLineAdd from '../../src/commands/cash-entry/line-add.js'
import SalesEntryLineUpdate from '../../src/commands/sales-entry/line-update.js'
import SalesEntryLineDelete from '../../src/commands/sales-entry/line-delete.js'
import PurchaseEntryLineUpdate from '../../src/commands/purchase-entry/line-update.js'
import PurchaseEntryLineDelete from '../../src/commands/purchase-entry/line-delete.js'

describe('entry line write commands', () => {
  it('registers line-add on every entry topic', () => {
    const commands = {
      salesEntry: SalesEntryLineAdd,
      purchaseEntry: PurchaseEntryLineAdd,
      journalEntry: JournalEntryLineAdd,
      bankEntry: BankEntryLineAdd,
      cashEntry: CashEntryLineAdd,
    }
    for (const [key, Command] of Object.entries(commands)) {
      expect(Command.descriptor, key).toBe(lineDescriptors[key])
    }
  })

  it('registers line-update and line-delete where the lines take PUT and DELETE', () => {
    // General journal, bank and cash entry lines take POST only.
    expect(SalesEntryLineUpdate.description).toContain(
      'PUT salesentry/SalesEntryLines',
    )
    expect(SalesEntryLineDelete.description).toContain(
      'DELETE salesentry/SalesEntryLines',
    )
    expect(PurchaseEntryLineUpdate.description).toContain(
      'PUT purchaseentry/PurchaseEntryLines',
    )
    expect(PurchaseEntryLineDelete.description).toContain(
      'DELETE purchaseentry/PurchaseEntryLines',
    )
  })
})
