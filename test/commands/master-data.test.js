import { describe, it, expect } from 'vitest'
import { findResource } from '../../src/lib/catalog.js'
import { masterData } from '../../src/lib/typed/master-data.js'
import GlAccountCreate from '../../src/commands/gl-account/create.js'
import GlAccountUpdate from '../../src/commands/gl-account/update.js'
import GlAccountDelete from '../../src/commands/gl-account/delete.js'
import JournalCreate from '../../src/commands/journal/create.js'
import JournalUpdate from '../../src/commands/journal/update.js'
import JournalDelete from '../../src/commands/journal/delete.js'
import VatCodeCreate from '../../src/commands/vat-code/create.js'
import VatCodeUpdate from '../../src/commands/vat-code/update.js'
import VatCodeDelete from '../../src/commands/vat-code/delete.js'
import PaymentConditionCreate from '../../src/commands/payment-condition/create.js'
import CostCenterCreate from '../../src/commands/cost-center/create.js'
import CostCenterUpdate from '../../src/commands/cost-center/update.js'
import CostCenterDelete from '../../src/commands/cost-center/delete.js'
import CostUnitCreate from '../../src/commands/cost-unit/create.js'
import CostUnitUpdate from '../../src/commands/cost-unit/update.js'
import CostUnitDelete from '../../src/commands/cost-unit/delete.js'

describe('master data write commands', () => {
  it('register each method the catalogue allows, by GUID or code', () => {
    const commands = [
      ['gl-account create', GlAccountCreate, 'POST '],
      ['gl-account update', GlAccountUpdate, 'PUT '],
      ['gl-account delete', GlAccountDelete, 'DELETE '],
      ['journal create', JournalCreate, 'POST '],
      ['journal update', JournalUpdate, 'PUT '],
      ['journal delete', JournalDelete, 'DELETE '],
      ['vat-code create', VatCodeCreate, 'POST '],
      ['vat-code update', VatCodeUpdate, 'PUT '],
      ['vat-code delete', VatCodeDelete, 'DELETE '],
      ['payment-condition create', PaymentConditionCreate, 'POST '],
      ['cost-center create', CostCenterCreate, 'POST '],
      ['cost-center update', CostCenterUpdate, 'PUT '],
      ['cost-center delete', CostCenterDelete, 'DELETE '],
      ['cost-unit create', CostUnitCreate, 'POST '],
      ['cost-unit update', CostUnitUpdate, 'PUT '],
      ['cost-unit delete', CostUnitDelete, 'DELETE '],
    ]
    for (const [name, Command, method] of commands) {
      expect(Command.description, name).toContain(method)
    }
    expect(commands).toHaveLength(16)
  })

  it('offer only methods the catalogue has', () => {
    const verbs = { create: 'POST', update: 'PUT', delete: 'DELETE' }
    for (const spec of Object.values(masterData)) {
      const res = findResource(spec.resource)
      for (const m of spec.methods) {
        expect(res.methods, `${spec.resource} ${m}`).toContain(verbs[m])
      }
      expect(spec.byCode && spec.codeFlags).toBe(true)
    }
  })
})
