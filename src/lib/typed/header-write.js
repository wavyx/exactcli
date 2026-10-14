import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { bodyFlags } from '../../commands/create.js'
import { CliError } from '../errors.js'
import { divisionPath } from '../odata.js'
import {
  applyRefs,
  assertWritesAllowed,
  describeRequest,
  parseSet,
  readBody,
  validateWrite,
  writeFlags,
} from '../writes.js'
import { headerKeys, headerRefs } from './line-list.js'

/**
 * Build the command that deletes one or more headers (invoices, entries,
 * orders), each named by its GUID or its number. The gate comes before the
 * number lookup; the deletes run one after the other, and a failure names
 * the headers already deleted.
 * @param {import('./line-descriptors.js').LineDescriptor} d
 * @returns {typeof BaseCommand}
 */
export function defineDeleteCommand(d) {
  return class HeaderDeleteCommand extends BaseCommand {
    static descriptor = d
    static description = `Delete ${d.plural}, by ${d.ref} (DELETE ${d.parent})`
    static examples = [
      `<%= config.bin %> ${d.topic} delete <number> --dry-run`,
      `<%= config.bin %> ${d.topic} delete <number> <guid> --allow-writes --yes`,
    ]

    /** One reference per argument, as many as needed. */
    static strict = false

    static args = {
      ref: Args.string({
        required: true,
        description: `${d.parentKey} GUID or ${d.number} (repeat for more)`,
      }),
    }

    static flags = {
      ...writeFlags,
      'dry-run': bodyFlags['dry-run'],
    }

    async run() {
      const { argv } = await this.parse(HeaderDeleteCommand)
      const refs = headerRefs(argv)
      const dryRun = this.flags['dry-run']
      validateWrite({ resource: d.parent, body: {}, method: 'DELETE' })
      // A refused write costs no call at all. A dry run needs no permission.
      if (!dryRun) assertWritesAllowed(this.flags, 'DELETE')

      const division = this.resolveDivision()
      const keys = await headerKeys(this, d, division, refs, { unique: true })
      const base = divisionPath(division, d.parent)
      const paths = keys.map((key) => `${base}(guid'${key}')`)
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
        deleted.push(keys[i])
      }
      await this.outputAction(
        { deleted },
        `Deleted ${deleted.length} ${d.plural}`,
      )
    }
  }
}

/**
 * Build the command that updates one header, named by its GUID or its
 * number, from `--set` and `--body`, validated against the catalogue.
 * @param {import('./line-descriptors.js').LineDescriptor} d
 * @returns {typeof BaseCommand}
 */
export function defineUpdateCommand(d) {
  return class HeaderUpdateCommand extends BaseCommand {
    static descriptor = d
    static description = `Update ${d.singular}, by ${d.ref} (PUT ${d.parent})`
    static examples = [
      `<%= config.bin %> ${d.topic} update <number> --set Description="New text" --dry-run`,
      `<%= config.bin %> ${d.topic} update <guid> --body @patch.json --allow-writes`,
    ]

    static args = {
      ref: Args.string({
        required: true,
        description: `${d.parentKey} GUID or ${d.number}`,
      }),
    }

    static flags = {
      ...writeFlags,
      body: bodyFlags.body,
      set: bodyFlags.set,
      'dry-run': bodyFlags['dry-run'],
    }

    async run() {
      const { args } = await this.parse(HeaderUpdateCommand)
      const refs = headerRefs([args.ref])
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
      validateWrite({ resource: d.parent, body, method: 'PUT' })
      // A refused write costs no call at all. A dry run needs no permission.
      if (!dryRun) assertWritesAllowed(this.flags, 'PUT')

      const division = this.resolveDivision()
      const [key] = await headerKeys(this, d, division, refs, { unique: true })
      const path = `${divisionPath(division, d.parent)}(guid'${key}')`
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
        { ok: true, key },
        `Updated ${d.singular.replace(/^an? /, '')} ${args.ref}`,
      )
    }
  }
}
