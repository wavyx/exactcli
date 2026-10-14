import { describe, it, expect } from 'vitest'
import { lineDescriptors } from '../../src/lib/typed/line-descriptors.js'
import SalesEntryLineAdd from '../../src/commands/sales-entry/line-add.js'
import PurchaseEntryLineAdd from '../../src/commands/purchase-entry/line-add.js'
import BankEntryLineAdd from '../../src/commands/bank-entry/line-add.js'
import CashEntryLineAdd from '../../src/commands/cash-entry/line-add.js'
import SalesEntryLineUpdate from '../../src/commands/sales-entry/line-update.js'
import SalesEntryLineDelete from '../../src/commands/sales-entry/line-delete.js'
import PurchaseEntryLineUpdate from '../../src/commands/purchase-entry/line-update.js'
import PurchaseEntryLineDelete from '../../src/commands/purchase-entry/line-delete.js'

describe('entry line write commands', () => {
  it('registers line-add on the entry topics whose lines take a POST', () => {
    // GeneralJournalEntryLines answers 500 "This method is currently not
    // supported" to a POST, although the reference lists it [live 2026-10-14].
    const commands = {
      salesEntry: SalesEntryLineAdd,
      purchaseEntry: PurchaseEntryLineAdd,
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

  it('registers line writes on sales invoices, orders and quotations', async () => {
    const verbs = { add: 'POST', update: 'PUT', delete: 'DELETE' }
    const topics = {
      salesInvoice: ['sales-invoice', ['add', 'update', 'delete']],
      salesOrder: ['sales-order', ['add', 'update', 'delete']],
      purchaseOrder: ['purchase-order', ['add', 'update', 'delete']],
      quotation: ['quotation', ['add', 'update', 'delete']],
      // Purchase invoice lines answer 403 to a POST on a licence that
      // creates the same invoice with its lines [live 2026-10-14]: no command.
    }
    for (const [key, [topic, methods]] of Object.entries(topics)) {
      for (const m of methods) {
        const { default: Command } = await import(
          `../../src/commands/${topic}/line-${m}.js`
        )
        expect(Command.description, `${topic} line-${m}`).toContain(
          `${verbs[m]} ${lineDescriptors[key].resource}`,
        )
      }
    }
  })
})
