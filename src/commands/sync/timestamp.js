import { Flags } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { CliError } from '../../lib/errors.js'
import { assertDate } from '../../lib/lines.js'
import { divisionPath, normalize, unwrap } from '../../lib/odata.js'

const COLUMNS = {
  API: { header: 'API' },
  TimeStampAsBigInt: { header: 'Timestamp' },
  Modified: { header: 'Modified' },
}

export default class SyncTimestampCommand extends BaseCommand {
  static description =
    'Find the sync timestamp of a date for one feed, to start a sync from that date'

  static examples = [
    '<%= config.bin %> sync timestamp --endpoint Accounts --modified 2026-01-01',
    '<%= config.bin %> sync timestamp --endpoint TransactionLines --modified 2026-01-01 --output json',
  ]

  static flags = {
    endpoint: Flags.string({
      required: true,
      description:
        'Feed name, for example Accounts or TransactionLines (the list: metadata read/sync/Sync/SyncTimestamp)',
    }),
    modified: Flags.string({
      required: true,
      description: 'Date (YYYY-MM-DD): the first timestamp at or after it',
    }),
  }

  async run() {
    const { endpoint, modified } = this.flags
    assertDate(modified, 'modified')
    // The feed name travels quoted in the query. Letters only, so a quote
    // cannot close it and add its own OData.
    if (!/^[A-Za-z]+$/.test(endpoint)) {
      throw new CliError('Expected a resource name such as Accounts', {
        exitCode: 64,
      })
    }
    // A function endpoint: the parameters travel as plain query values.
    const path = divisionPath(
      this.resolveDivision(),
      'read/sync/Sync/SyncTimestamp',
    )
    const body = await this.apiClient.get(path, {
      query: { modified: `datetime'${modified}'`, endPoint: `'${endpoint}'` },
    })
    const data = unwrap(body)
    const rows = normalize(Array.isArray(data) ? data : [data])
    await this.outputResults(rows, COLUMNS)
  }
}
