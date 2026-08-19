import BaseCommand from '../base-command.js'

export default class VersionCommand extends BaseCommand {
  static skipAuth = true

  static description = 'Show the CLI version and runtime'

  static examples = [
    '<%= config.bin %> version',
    '<%= config.bin %> version --output json',
  ]

  async run() {
    const info = {
      exactcli: this.config.version,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
    }
    await this.outputAction(
      info,
      `exactcli/${info.exactcli} node/${info.node} ${info.platform}`,
    )
  }
}
