import { Flags } from '@oclif/core'
import BaseCommand from '../base-command.js'
import { divisionPath } from '../lib/odata.js'
import {
  finishSync,
  readState,
  resolveSince,
  syncSince,
} from '../lib/sync-state.js'
import { syncFlags } from './sync/index.js'

const KEY = 'Deleted'

const COLUMNS = {
  Timestamp: { header: 'Timestamp' },
  EntityType: { header: 'EntityType' },
  EntityKey: { header: 'EntityKey' },
  DeletedDate: { header: 'DeletedDate' },
  DeletedBy: { header: 'DeletedBy' },
}

export default class DeletedCommand extends BaseCommand {
  static description =
    'Read the records deleted since a timestamp (sync/Deleted); pair it with sync'

  static examples = [
    '<%= config.bin %> deleted --since 0',
    '<%= config.bin %> deleted --state ./sync.json --type 10',
  ]

  static flags = {
    ...syncFlags,
    type: Flags.integer({ description: 'Only this EntityType code' }),
  }

  async run() {
    const path = divisionPath(this.resolveDivision(), 'sync/Deleted')
    const stateFile = this.flags.state
    const state = stateFile ? readState(stateFile) : {}
    const since = resolveSince(this.flags, state, KEY)
    const filter =
      this.flags.type === undefined
        ? undefined
        : `EntityType eq ${this.flags.type}`

    const result = await syncSince(this, { path, since, filter })
    await this.outputResults(result.rows, COLUMNS)
    finishSync(result, { since, key: KEY, stateFile, state })
  }
}
