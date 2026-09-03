import { Args } from '@oclif/core'
import BaseCommand from '../../base-command.js'
import { setProfileConfig } from '../../lib/config.js'
import { ApiError, CliError } from '../../lib/errors.js'
import { normalize, unwrap } from '../../lib/odata.js'

export default class DivisionUseCommand extends BaseCommand {
  static description =
    'Make a division (administration) the default of the profile'

  static examples = [
    '<%= config.bin %> division use 123456',
    '<%= config.bin %> division use 123456 --profile acme',
  ]

  static args = {
    code: Args.string({ required: true, description: 'Division code' }),
  }

  async run() {
    const { args } = await this.parse(DivisionUseCommand)
    if (!/^\d+$/.test(args.code) || Number(args.code) <= 0) {
      throw new CliError('Division code must be a positive integer', {
        exitCode: 64,
      })
    }
    const code = Number(args.code)

    // Ask the division about itself before it becomes the default: a code
    // the account cannot reach would break every following command.
    let body
    try {
      body = await this.apiClient.get(
        `/api/v1/${code}/system/Divisions(${code})`,
        { query: { $select: 'Code,Description' } },
      )
    } catch (err) {
      const status = err instanceof ApiError ? err.statusCode : undefined
      if (status === 403 || status === 404) {
        throw new CliError(
          `Division ${code} is not accessible with this account`,
          { exitCode: 65, cause: err },
        )
      }
      throw err
    }
    const data = unwrap(body)
    const record = normalize(Array.isArray(data) ? data[0] : data)
    const description = record?.Description ?? null

    setProfileConfig(this.activeProfile, 'division', code)
    await this.outputAction(
      { profile: this.activeProfile, division: code, description },
      `Division ${code} (${description ?? '-'}) is now active for profile ${this.activeProfile}`,
    )
  }
}
