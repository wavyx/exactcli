import BaseCommand from '../base-command.js'
import { CliError } from '../lib/errors.js'
import { divisionPath } from '../lib/odata.js'

const COLUMNS = {
  minutelyLimit: { header: 'Minute limit' },
  minutelyRemaining: { header: 'Minute remaining' },
  minutelyReset: { header: 'Minute reset' },
  dailyLimit: { header: 'Day limit' },
  dailyRemaining: { header: 'Day remaining' },
  dailyReset: { header: 'Day reset' },
}

/** @param {number | undefined} ms @returns {string | null} */
const iso = (ms) => (ms === undefined ? null : new Date(ms).toISOString())

export default class QuotaCommand extends BaseCommand {
  static description =
    'Show the rate-limit budget of the division (one cheap call)'

  static examples = [
    '<%= config.bin %> quota',
    '<%= config.bin %> quota --output json',
  ]

  async run() {
    // current/Me is quota free and carries no budget headers, so the probe
    // reads the smallest answer a division endpoint can give.
    const path = divisionPath(this.resolveDivision(), 'system/Divisions')
    await this.apiClient.get(path, { query: { $top: 1, $select: 'Code' } })

    const budget = this.apiClient.lastRateLimit
    if (budget?.minutelyLimit === undefined) {
      throw new CliError('Exact Online sent no rate-limit headers', {
        exitCode: 69,
      })
    }

    await this.outputResults(
      {
        minutelyLimit: budget.minutelyLimit,
        minutelyRemaining: budget.minutelyRemaining,
        minutelyReset: iso(budget.minutelyReset),
        dailyLimit: budget.limit,
        dailyRemaining: budget.remaining,
        dailyReset: iso(budget.reset),
      },
      COLUMNS,
    )
  }
}
