import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { bodyFlags } from '../../commands/create.js'
import { CliError } from '../errors.js'
import { divisionPath } from '../odata.js'
import { GUID_RE } from '../refs.js'
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
 */

/**
 * The GUIDs of the arguments, without duplicates. A GUID lands in a path, so
 * anything else could change the request.
 * @param {string[]} argv
 * @returns {string[]}
 */
function guids(argv) {
  const bad = argv.find((ref) => !GUID_RE.test(ref))
  if (bad !== undefined) {
    throw new CliError(`Expected a GUID, received ${bad}`, { exitCode: 64 })
  }
  return [...new Set(argv.map((ref) => ref.toLowerCase()))]
}

/**
 * Build the command that deletes records of a GUID-keyed resource. The deletes
 * run one after the other; a failure names the records already deleted.
 * @param {RecordSpec} spec
 * @returns {typeof BaseCommand}
 */
export function defineRecordDeleteCommand(spec) {
  return class RecordDeleteCommand extends BaseCommand {
    static description = `Delete ${spec.plural}, by GUID (DELETE ${spec.resource})`
    static examples = [
      `<%= config.bin %> ${spec.topic} delete <guid> --dry-run`,
      `<%= config.bin %> ${spec.topic} delete <guid> <guid> --allow-writes --yes`,
    ]

    /** One GUID per argument, as many as needed. */
    static strict = false

    static args = {
      id: Args.string({
        required: true,
        description: 'ID GUID (repeat for more)',
      }),
    }

    static flags = { ...writeFlags, 'dry-run': bodyFlags['dry-run'] }

    async run() {
      const { argv } = await this.parse(RecordDeleteCommand)
      const ids = guids(argv)
      const dryRun = this.flags['dry-run']
      validateWrite({ resource: spec.resource, body: {}, method: 'DELETE' })
      if (!dryRun) assertWritesAllowed(this.flags, 'DELETE')

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
    static description = `Update ${spec.singular}, by GUID (PUT ${spec.resource})`
    static examples = [
      `<%= config.bin %> ${spec.topic} update <guid> --set Description="New text" --dry-run`,
      `<%= config.bin %> ${spec.topic} update <guid> --body @patch.json --allow-writes`,
    ]

    static args = {
      id: Args.string({ required: true, description: 'ID GUID' }),
    }

    static flags = {
      ...writeFlags,
      body: bodyFlags.body,
      set: bodyFlags.set,
      'dry-run': bodyFlags['dry-run'],
    }

    async run() {
      const { args } = await this.parse(RecordUpdateCommand)
      const [id] = guids([args.id])
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
