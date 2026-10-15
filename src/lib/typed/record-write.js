import { Args, Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { bodyFlags } from '../../commands/create.js'
import { CliError } from '../errors.js'
import { autoColumns, divisionPath, normalize, unwrap } from '../odata.js'
import { GUID_RE, resolveRef } from '../refs.js'
import {
  applyRefs,
  assertWritesAllowed,
  describeRequest,
  parseSet,
  readBody,
  validateWrite,
  writeFlags,
} from '../writes.js'

/**
 * @typedef {object} RecordSpec
 * @property {string} topic command topic
 * @property {string} resource `service/Resource`, keyed by an ID GUID
 * @property {string} singular for example "a direct debit mandate"
 * @property {string} plural for example "direct debit mandates"
 * @property {boolean} [byCode] a reference may also be the Code of the record
 * @property {boolean} [codeFlags] create takes --code and --description
 */

/**
 * The references of the arguments, without duplicates: GUIDs, and codes when
 * the spec allows them. A GUID lands in a path and a code in a quoted filter,
 * so anything else is refused here.
 * @param {string[]} argv
 * @param {RecordSpec} spec
 * @returns {string[]}
 */
function checkRefs(argv, spec) {
  const bad = argv.find(
    (ref) => !GUID_RE.test(ref) && !(spec.byCode && ref.trim() !== ''),
  )
  if (bad !== undefined) {
    throw new CliError(
      `Expected a GUID${spec.byCode ? ' or a code' : ''}, received ${bad}`,
      { exitCode: 64 },
    )
  }
  return [
    ...new Set(
      argv.map((ref) => (GUID_RE.test(ref) ? ref.toLowerCase() : ref)),
    ),
  ]
}

/**
 * The GUIDs of checked references: a code is looked up, one after the other.
 * Call it after the write gate.
 * @param {{ apiClient: object, resolveDivision: () => number }} cmd
 * @param {RecordSpec} spec
 * @param {string[]} refs
 * @returns {Promise<string[]>}
 */
async function recordKeys(cmd, spec, refs) {
  const keys = []
  for (const ref of refs) {
    const key = GUID_RE.test(ref)
      ? ref
      : (await resolveRef(cmd, spec.resource, ref)).toLowerCase()
    if (!keys.includes(key)) keys.push(key)
  }
  return keys
}

/**
 * The fields that the --code and --description flags name.
 * @param {{ code?: string, description?: string }} flags
 * @returns {object}
 */
function namedFields({ code, description }) {
  const fields = {}
  if (code !== undefined) fields.Code = code
  if (description !== undefined) fields.Description = description
  return fields
}

/** How a command names its references. */
const refWord = (spec) => (spec.byCode ? 'GUID or code' : 'GUID')

/**
 * Build the command that creates one record of a resource, from --code and
 * --description when the spec has them, plus --set and --body, validated
 * against the catalogue.
 * @param {RecordSpec} spec
 * @returns {typeof BaseCommand}
 */
export function defineRecordCreateCommand(spec) {
  const examples = spec.codeFlags
    ? [
        `<%= config.bin %> ${spec.topic} create --code X1 --description "New one" --dry-run`,
        `<%= config.bin %> ${spec.topic} create --code X1 --description "New one" --set Key=value --allow-writes`,
      ]
    : [
        `<%= config.bin %> ${spec.topic} create --set Key=value --dry-run`,
        `<%= config.bin %> ${spec.topic} create --body @record.json --allow-writes`,
      ]
  const codeFlags = spec.codeFlags
    ? {
        code: Flags.string({ description: 'Code' }),
        description: Flags.string({ description: 'Description' }),
      }
    : {}

  return class RecordCreateCommand extends BaseCommand {
    static description = `Create ${spec.singular} (POST ${spec.resource})`
    static examples = examples

    static flags = {
      ...writeFlags,
      ...codeFlags,
      body: bodyFlags.body,
      set: bodyFlags.set,
      'dry-run': bodyFlags['dry-run'],
    }

    async run() {
      const { flags } = this
      const dryRun = flags['dry-run']
      // Piped stdin is the body only when no flag names a field: a script
      // that passes --code must not hang on an open stdin.
      const named = flags.code !== undefined || flags.description !== undefined
      const body = {
        ...(named && !flags.body ? {} : await readBody(flags)),
        ...parseSet(flags.set),
      }
      Object.assign(body, namedFields(flags))
      validateWrite({ resource: spec.resource, body, method: 'POST' })
      // A refused write costs no call at all. A dry run needs no permission.
      if (!dryRun) assertWritesAllowed(flags, 'POST')

      const path = divisionPath(this.resolveDivision(), spec.resource)
      const resolved = await applyRefs(this, body)
      if (dryRun) {
        await this.outputResults(
          describeRequest({ method: 'POST', path, body: resolved }),
          {},
        )
        return
      }
      const record = normalize(
        unwrap(await this.apiClient.post(path, resolved)),
      )
      await this.outputResults(record, autoColumns([record]))
    }
  }
}

/**
 * Build the command that deletes records of a GUID-keyed resource. The deletes
 * run one after the other; a failure names the records already deleted.
 * @param {RecordSpec} spec
 * @returns {typeof BaseCommand}
 */
export function defineRecordDeleteCommand(spec) {
  return class RecordDeleteCommand extends BaseCommand {
    static description = `Delete ${spec.plural}, by ${refWord(spec)} (DELETE ${spec.resource})`
    static examples = [
      `<%= config.bin %> ${spec.topic} delete <guid> --dry-run`,
      `<%= config.bin %> ${spec.topic} delete <guid> <guid> --allow-writes --yes`,
    ]

    /** One GUID per argument, as many as needed. */
    static strict = false

    static args = {
      id: Args.string({
        required: true,
        description: `ID ${refWord(spec)} (repeat for more)`,
      }),
    }

    static flags = { ...writeFlags, 'dry-run': bodyFlags['dry-run'] }

    async run() {
      const { argv } = await this.parse(RecordDeleteCommand)
      const refs = checkRefs(argv, spec)
      const dryRun = this.flags['dry-run']
      validateWrite({ resource: spec.resource, body: {}, method: 'DELETE' })
      // The gate comes before the code lookups.
      if (!dryRun) assertWritesAllowed(this.flags, 'DELETE')
      const ids = await recordKeys(this, spec, refs)

      const base = divisionPath(this.resolveDivision(), spec.resource)
      const paths = ids.map((id) => `${base}(guid'${id}')`)
      if (dryRun) {
        await this.outputResults(
          paths.map((path) => describeRequest({ method: 'DELETE', path })),
          {},
        )
        return
      }

      const deleted = []
      for (const [i, path] of paths.entries()) {
        try {
          await this.apiClient.del(path)
        } catch (err) {
          if (deleted.length > 0) {
            process.stderr.write(
              `Deleted before the failure: ${deleted.join(', ')}\n`,
            )
          }
          throw err
        }
        deleted.push(ids[i])
      }
      await this.outputAction(
        { deleted },
        `Deleted ${deleted.length} ${spec.plural}`,
      )
    }
  }
}

/**
 * Build the command that updates one record of a GUID-keyed resource from
 * `--set` and `--body`, validated against the catalogue.
 * @param {RecordSpec} spec
 * @returns {typeof BaseCommand}
 */
export function defineRecordUpdateCommand(spec) {
  return class RecordUpdateCommand extends BaseCommand {
    static description = `Update ${spec.singular}, by ${refWord(spec)} (PUT ${spec.resource})`
    static examples = [
      `<%= config.bin %> ${spec.topic} update <guid> --set Description="New text" --dry-run`,
      `<%= config.bin %> ${spec.topic} update <guid> --body @patch.json --allow-writes`,
    ]

    static args = {
      id: Args.string({ required: true, description: `ID ${refWord(spec)}` }),
    }

    static flags = {
      ...writeFlags,
      body: bodyFlags.body,
      set: bodyFlags.set,
      'dry-run': bodyFlags['dry-run'],
    }

    async run() {
      const { args } = await this.parse(RecordUpdateCommand)
      const refs = checkRefs([args.id], spec)
      const dryRun = this.flags['dry-run']
      const body = {
        ...(await readBody(this.flags)),
        ...parseSet(this.flags.set),
      }
      if (Object.keys(body).length === 0) {
        throw new CliError('Nothing to update: give --set or --body', {
          exitCode: 64,
        })
      }
      validateWrite({ resource: spec.resource, body, method: 'PUT' })
      if (!dryRun) assertWritesAllowed(this.flags, 'PUT')

      const [id] = await recordKeys(this, spec, refs)
      const path = `${divisionPath(this.resolveDivision(), spec.resource)}(guid'${id}')`
      const resolved = await applyRefs(this, body)
      if (dryRun) {
        await this.outputResults(
          describeRequest({ method: 'PUT', path, body: resolved }),
          {},
        )
        return
      }

      await this.apiClient.put(path, resolved)
      await this.outputAction(
        { ok: true, key: id },
        `Updated ${spec.singular.replace(/^an? /, '')} ${id}`,
      )
    }
  }
}
