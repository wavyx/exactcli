import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { findResource, loadCatalog, mandatoryFields } from '../catalog.js'
import { CliError } from '../errors.js'
import { assertDate, parseNumber } from '../lines.js'
import { autoColumns, divisionPath, normalize, unwrap } from '../odata.js'
import { GUID_RE, resolveRef } from '../refs.js'
import {
  assertWritesAllowed,
  describeRequest,
  validateWrite,
  writeFlags,
} from '../writes.js'

/**
 * @typedef {'int'|'number'|'bool'|'date'|'guid'|'string'} FieldType
 *
 * @typedef ActionField
 * @property {string} field the property name in the request body
 * @property {FieldType} type
 * @property {string} description
 * @property {boolean} [required]
 * @property {string} [resolve] a resource whose code resolves to the GUID
 *
 * @typedef Action
 * @property {string} topic
 * @property {string} verb
 * @property {string} resource the POST-only resource, for example crm/AcceptQuotation
 * @property {string} description
 * @property {{field: string, type?: 'guid'|'string', description: string}} target the positional argument
 * @property {Record<string, ActionField>} fields flag name to field
 * @property {string[]} [examples]
 */

const INT_RE = /^-?\d+$/

/**
 * A flag value as the request body carries it.
 * @param {FieldType} type
 * @param {string} value
 * @param {string} flag
 * @returns {string | number}
 */
export function coerceField(type, value, flag) {
  if (type === 'int') {
    if (!INT_RE.test(value)) {
      throw new CliError(`--${flag} expects an integer, received: ${value}`, {
        exitCode: 64,
      })
    }
    return Number(value)
  }
  if (type === 'number') return parseNumber(value, flag)
  if (type === 'date') {
    assertDate(value, flag)
    return value
  }
  if (type === 'guid' && !GUID_RE.test(value)) {
    throw new CliError(`--${flag} expects a GUID, received: ${value}`, {
      exitCode: 64,
    })
  }
  return value
}

/**
 * The value of the positional argument: a GUID unless the target is a string.
 * @param {Action['target']} target
 * @param {string} value
 * @returns {string}
 */
export function targetValue(target, value) {
  if (target.type !== 'string' && !GUID_RE.test(value)) {
    throw new CliError(`Expected a GUID, received: ${value}`, { exitCode: 64 })
  }
  return value
}

/**
 * The request body: the target, then every flag that was given.
 * @param {BaseCommand} cmd
 * @param {Action} action
 * @param {Record<string, unknown>} flags
 * @param {string} target
 * @returns {Promise<Record<string, unknown>>}
 */
export async function buildActionBody(cmd, action, flags, target) {
  const body = { [action.target.field]: target }
  for (const [name, def] of Object.entries(action.fields)) {
    const raw = flags[name]
    if (raw === undefined) continue
    if (def.type === 'bool') body[def.field] = raw
    else if (def.resolve)
      body[def.field] = await resolveRef(cmd, def.resolve, raw)
    else body[def.field] = coerceField(def.type, raw, name)
  }
  return body
}

/**
 * Check an action against the catalogue: the resource takes a POST, every
 * field is a property that a POST accepts, and every mandatory property is
 * the target or a required flag. Throws a plain Error.
 * @param {Action} action
 * @param {object} [catalog]
 */
export function validateAction(action, catalog = loadCatalog()) {
  const res = findResource(action.resource, catalog)
  if (!res) throw new Error(`unknown resource ${action.resource}`)
  const problems = []
  if (!res.methods.includes('POST')) problems.push('no POST')
  const byName = new Map(res.properties.map((p) => [p.name, p]))
  const fields = [
    action.target.field,
    ...Object.values(action.fields).map((f) => f.field),
  ]
  for (const field of fields) {
    const prop = byName.get(field)
    if (!prop) problems.push(`unknown field ${field}`)
    else if (prop.post === false) problems.push(`${field} refuses POST`)
  }
  const covered = new Set([
    action.target.field,
    ...Object.values(action.fields)
      .filter((f) => f.required)
      .map((f) => f.field),
  ])
  const missing = mandatoryFields(res).filter((f) => !covered.has(f))
  if (missing.length)
    problems.push(`mandatory not covered: ${missing.join(',')}`)
  if (problems.length) {
    throw new Error(`${action.resource}: ${problems.join('; ')}`)
  }
}

/**
 * A command `<topic> <verb> <id>` that posts one record to a POST-only
 * resource: an action of Exact Online such as accept, print or complete.
 * @param {Action} action
 */
export function defineActionCommand(action) {
  const fieldFlags = Object.fromEntries(
    Object.entries(action.fields).map(([name, f]) => [
      name,
      f.type === 'bool'
        ? Flags.boolean({ description: f.description })
        : Flags.string({ description: f.description, required: f.required }),
    ]),
  )
  const bin = '<%= config.bin %>'
  const usage = `${action.topic} ${action.verb}`

  return class TypedActionCommand extends BaseCommand {
    static action = action
    static description = `${action.description} (POST ${action.resource})`
    static examples = action.examples ?? [
      `${bin} ${usage} <id> --dry-run`,
      `${bin} ${usage} <id> --allow-writes`,
    ]
    static args = {
      id: Args.string({
        required: true,
        description: action.target.description,
      }),
    }
    static flags = {
      ...writeFlags,
      'dry-run': Flags.boolean({
        description: 'Show the validated request and send nothing',
      }),
      ...fieldFlags,
    }

    async run() {
      const { args } = await this.parse(TypedActionCommand)
      const dryRun = this.flags['dry-run']
      // A refused write costs nothing: refuse before any lookup.
      if (!dryRun) assertWritesAllowed(this.flags, 'POST')
      const target = targetValue(action.target, args.id)
      const body = await buildActionBody(this, action, this.flags, target)
      const path = divisionPath(this.resolveDivision(), action.resource)
      validateWrite({ resource: action.resource, body, method: 'POST' })

      if (dryRun) {
        await this.outputResults(
          describeRequest({ method: 'POST', path, body }),
          {},
        )
        return
      }
      const data = unwrap(await this.apiClient.post(path, body))
      const record = normalize(Array.isArray(data) ? data[0] : data)
      await this.outputResults(record, autoColumns([record]))
    }
  }
}
