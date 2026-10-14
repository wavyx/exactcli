import { Args } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { shortName } from '../lib/catalog.js'
import { CliError } from '../lib/errors.js'
import { bodyValue, findMatches, parseMatch } from '../lib/lookup.js'
import { divisionPath, unwrap } from '../lib/odata.js'
import { renderKey } from '../lib/refs.js'
import {
  applyRefs,
  assertWritesAllowed,
  describeRequest,
  parseSet,
  readBody,
  validateWrite,
  writeFlags,
} from '../lib/writes.js'
import { bodyFlags } from './create.js'
import { describeMatch, knownResource, matchFlags } from './lookup.js'

export default class UpsertCommand extends BaseCommand {
  static description =
    'Create the record that --match finds nothing for, or update the one ' +
    'it finds (POST or PUT), validated against the catalogue'

  static examples = [
    '<%= config.bin %> upsert crm/Accounts --match Code=1001 --set Name="Acme NV" --dry-run',
    '<%= config.bin %> upsert crm/Accounts --match Code=1001 --set Name="Acme NV" --set Status=C --allow-writes',
  ]

  static args = {
    resource: Args.string({
      required: true,
      description: 'Resource path, for example crm/Accounts',
    }),
  }

  static flags = {
    ...writeFlags,
    ...matchFlags,
    body: bodyFlags.body,
    set: bodyFlags.set,
    'dry-run': bodyFlags['dry-run'],
  }

  async run() {
    const { args } = await this.parse(UpsertCommand)
    const res = knownResource(args.resource)
    const ref = shortName(res)
    const matches = parseMatch(this.flags.match)
    const dryRun = this.flags['dry-run']
    const fields = {
      ...(await readBody(this.flags)),
      ...parseSet(this.flags.set),
    }
    // The create carries the match, unless the body sets it; the update
    // leaves the match fields alone, since they identify the record.
    const created = { ...fields }
    // findMatches refuses an unknown field before a create can happen.
    for (const m of matches) {
      const prop = res.properties.find((p) => p.name === m.field)
      created[m.field] ??= bodyValue(prop ?? {}, m.value)
    }
    const changed = Object.fromEntries(
      Object.entries(fields).filter(
        ([key]) => !matches.some((m) => m.field === key),
      ),
    )
    // A refused write costs no call at all. A dry run needs no permission.
    if (!dryRun) assertWritesAllowed(this.flags, 'POST')

    const rows = await findMatches(this, res, matches, { top: 2 })
    if (rows.length > 1) {
      throw new CliError(
        `Several ${args.resource} match ${describeMatch(matches)}: ${rows.map((r) => r[res.keys[0]]).join(', ')}. Add a --match`,
        { exitCode: 65 },
      )
    }
    const base = divisionPath(this.resolveDivision(), ref)
    if (rows.length === 0) {
      await this.#create(base, created, dryRun, res)
      return
    }
    const key = String(rows[0][res.keys[0]])
    if (Object.keys(changed).length === 0) {
      await this.outputAction(
        { action: 'unchanged', key },
        `Unchanged: ${args.resource} ${key}`,
      )
      return
    }
    // Each branch checks its own method: a resource without PUT can still
    // take the create, and a field may be writable on POST only.
    validateWrite({ resource: ref, body: changed, method: 'PUT' })
    const path = `${base}${renderKey(res, ref, key)}`
    const body = await applyRefs(this, changed)
    if (dryRun) {
      await this.outputResults(
        {
          action: 'update',
          key,
          request: describeRequest({ method: 'PUT', path, body }),
        },
        {},
      )
      return
    }
    await this.apiClient.put(path, body)
    await this.outputAction(
      { action: 'updated', key },
      `Updated ${args.resource} ${key}`,
    )
  }

  async #create(path, fields, dryRun, res) {
    validateWrite({ resource: shortName(res), body: fields, method: 'POST' })
    const body = await applyRefs(this, fields)
    if (dryRun) {
      await this.outputResults(
        {
          action: 'create',
          request: describeRequest({ method: 'POST', path, body }),
        },
        {},
      )
      return
    }
    const data = unwrap(await this.apiClient.post(path, body))
    const key = data[res.keys[0]]
    await this.outputAction(
      { action: 'created', key },
      `Created ${shortName(res)} ${key}`,
    )
  }
}
