import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { resolvePath } from '../../lib/catalog.js'
import { CliError } from '../../lib/errors.js'
import { parseNumber } from '../../lib/lines.js'
import { renderKey, resolveRef } from '../../lib/refs.js'
import { renderValue } from '../../lib/typed/factory.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../../lib/writes.js'
import {
  BOOL_FIELDS,
  NUMBER_FIELDS,
  REF_FIELDS,
  TEXT_FIELDS,
} from './create.js'

const RESOURCE = 'logistics/Items'

export default class ItemUpdateCommand extends BaseCommand {
  static description = `Update the given fields of an item (PUT ${RESOURCE}). The code is the key and stays as it is`

  static examples = [
    '<%= config.bin %> item update WIDGET --description "Widget XL" --sales-price 120 --dry-run',
    '<%= config.bin %> item update <id> --gl-revenue 700000 --stock false --allow-writes',
  ]

  static args = {
    id: Args.string({
      required: true,
      description: 'Item GUID or code',
    }),
  }

  static flags = {
    ...writeFlags,
    description: Flags.string({ description: 'Item description' }),
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
    const { args } = await this.parse(ItemUpdateCommand)
    const { flags } = this
    const dryRun = flags['dry-run']
    const { path: basePath, resource } = resolvePath(
      this.resolveDivision(),
      RESOURCE,
    )

    // There is no --code flag, so the Code entry of the table never matches.
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
    const fields = Object.keys(body)
    if (fields.length === 0) {
      throw new CliError('Nothing to update: give at least one field flag', {
        exitCode: 64,
      })
    }
    validateWrite({ resource: RESOURCE, body, method: 'PUT' })
    // The gate comes before the lookups: a refused write costs no call at
    // all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(flags, 'PUT')

    const id = await resolveRef(this, RESOURCE, args.id)
    const path = `${basePath}${renderKey(resource, RESOURCE, id)}`
    for (const [flag, { field, resource: ref }] of Object.entries(REF_FIELDS)) {
      if (flags[flag] !== undefined) {
        body[field] = await resolveRef(this, ref, flags[flag])
      }
    }

    if (dryRun) {
      await this.outputResults(
        describeRequest({ method: 'PUT', path, body }),
        {},
      )
      return
    }

    await this.apiClient.put(path, body)
    await this.outputAction(
      { ok: true, path, key: id, fields },
      `Updated ${RESOURCE} ${args.id}: ${fields.join(', ')}`,
    )
  }
}
