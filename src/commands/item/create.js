import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { parseNumber } from '../../lib/lines.js'
import { autoColumns, normalize, unwrap } from '../../lib/odata.js'
import { resolveRef } from '../../lib/refs.js'
import { renderValue } from '../../lib/typed/factory.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'

const RESOURCE = 'logistics/Items'

/** The text flags and the field each one fills. */
export const TEXT_FIELDS = {
  code: 'Code',
  description: 'Description',
  unit: 'Unit',
}

/** The number flags and the field each one fills. */
export const NUMBER_FIELDS = {
  'sales-price': 'StandardSalesPrice',
  'cost-price': 'CostPriceStandard',
}

/** The true-or-false flags and the field each one fills. */
export const BOOL_FIELDS = {
  sales: 'IsSalesItem',
  purchase: 'IsPurchaseItem',
  stock: 'IsStockItem',
}

/** The reference flags: the field each one fills and the resource of the code. */
export const REF_FIELDS = {
  'gl-revenue': { field: 'GLRevenue', resource: 'financial/GLAccounts' },
  'gl-costs': { field: 'GLCosts', resource: 'financial/GLAccounts' },
  group: { field: 'ItemGroup', resource: 'logistics/ItemGroups' },
}

export default class ItemCreateCommand extends BaseCommand {
  static description = `Create an item, a product or a service (POST ${RESOURCE})`

  static examples = [
    '<%= config.bin %> item create --code WIDGET --description Widget --sales-price 99.5 --sales true --dry-run',
    '<%= config.bin %> item create --code WIDGET --description Widget --gl-revenue 700000 --allow-writes',
  ]

  static flags = {
    ...writeFlags,
    code: Flags.string({ required: true, description: 'Item code' }),
    description: Flags.string({
      required: true,
      description: 'Item description',
    }),
    'sales-price': Flags.string({
      description: 'Standard sales price (StandardSalesPrice)',
    }),
    'cost-price': Flags.string({
      description: 'Standard cost price (CostPriceStandard)',
    }),
    unit: Flags.string({ description: 'Unit code, for example pc' }),
    sales: Flags.string({
      description: 'Sales item: true, false, yes, no, 1 or 0 (IsSalesItem)',
    }),
    purchase: Flags.string({
      description:
        'Purchase item: true, false, yes, no, 1 or 0 (IsPurchaseItem)',
    }),
    stock: Flags.string({
      description: 'Stock item: true, false, yes, no, 1 or 0 (IsStockItem)',
    }),
    'gl-revenue': Flags.string({
      description: 'Revenue ledger account code or GUID (GLRevenue)',
    }),
    'gl-costs': Flags.string({
      description: 'Costs ledger account code or GUID (GLCosts)',
    }),
    group: Flags.string({
      description: 'Item group code or GUID (ItemGroup)',
    }),
    'dry-run': Flags.boolean({
      description: 'Show the validated request and send nothing',
      default: false,
    }),
  }

  async run() {
    const { flags } = this
    const dryRun = flags['dry-run']
    const { path } = resolvePath(this.resolveDivision(), RESOURCE)

    const body = {}
    for (const [flag, field] of Object.entries(TEXT_FIELDS)) {
      if (flags[flag] !== undefined) body[field] = flags[flag]
    }
    for (const [flag, field] of Object.entries(NUMBER_FIELDS)) {
      if (flags[flag] !== undefined)
        body[field] = parseNumber(flags[flag], flag)
    }
    for (const [flag, field] of Object.entries(BOOL_FIELDS)) {
      if (flags[flag] !== undefined) {
        body[field] = renderValue('bool', flags[flag]) === 'true'
      }
    }
    // A reference stays a code or a GUID here: the lookup runs after the gate.
    for (const [flag, { field }] of Object.entries(REF_FIELDS)) {
      if (flags[flag] !== undefined) body[field] = flags[flag]
    }
    validateWrite({ resource: RESOURCE, body, method: 'POST' })
    // The gate comes before the reference lookups: a refused write costs no
    // call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(flags, 'POST')

    for (const [flag, { field, resource }] of Object.entries(REF_FIELDS)) {
      if (flags[flag] !== undefined) {
        body[field] = await resolveRef(this, resource, flags[flag])
      }
    }

    if (dryRun) {
      await this.outputResults(
        describeRequest({ method: 'POST', path, body }),
        {},
      )
      return
    }

    const record = normalize(unwrap(await this.apiClient.post(path, body)))
    await this.outputResults(record, autoColumns([record]))
  }
}
