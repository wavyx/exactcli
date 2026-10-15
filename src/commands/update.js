import { Args } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { betaRef, resolvePath } from '../lib/catalog.js'
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

export default class UpdateCommand extends BaseCommand {
  static description = 'Update a record (PUT), validated against the catalogue'

  static examples = [
    '<%= config.bin %> update crm/Accounts <id> --set Name="Acme NV" --allow-writes',
    '<%= config.bin %> update crm/Accounts <id> --body @patch.json --dry-run',
  ]

  static args = {
    resource: Args.string({
      required: true,
      description: 'Resource path, for example crm/Accounts',
    }),
    id: Args.string({
      required: true,
      description: 'Record key: a GUID, or a plain key such as 123456',
    }),
  }

  static flags = { ...writeFlags, ...bodyFlags }

  async run() {
    const { args } = await this.parse(UpdateCommand)
    const { force, beta } = this.flags
    const dryRun = this.flags['dry-run']
    const { path: basePath, resource } = resolvePath(
      this.resolveDivision(),
      args.resource,
      { beta },
    )
    const key = renderKey(resource, args.resource, args.id)
    const path = `${basePath}${key}`

    const body = {
      ...(await readBody(this.flags)),
      ...parseSet(this.flags.set),
    }
    validateWrite({
      resource: betaRef(args.resource, beta),
      body,
      method: 'PUT',
      force,
    })
    if (!dryRun) assertWritesAllowed(this.flags, 'PUT')
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
      { ok: true, path, key: args.id },
      `Updated ${args.resource} ${args.id}`,
    )
  }
}
