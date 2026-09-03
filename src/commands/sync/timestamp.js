import BaseCommand from '../../base-command.js'
import { divisionPath, normalize, unwrap } from '../../lib/odata.js'

const COLUMNS = {
  API: { header: 'API' },
  TimeStampAsBigInt: { header: 'Timestamp' },
  Modified: { header: 'Modified' },
}

export default class SyncTimestampCommand extends BaseCommand {
  static description =
    'Show the current sync timestamp per endpoint (read/sync/Sync/SyncTimestamp)'

  static examples = [
    '<%= config.bin %> sync timestamp',
    '<%= config.bin %> sync timestamp --output json',
  ]

  async run() {
    const path = divisionPath(
      this.resolveDivision(),
      'read/sync/Sync/SyncTimestamp',
    )
    const body = await this.apiClient.get(path)
    const data = unwrap(body)
    const rows = normalize(Array.isArray(data) ? data : [data])
    await this.outputResults(rows, COLUMNS)
  }
}
